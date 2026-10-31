package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"
)

type Edit struct {
	Op   string `json:"op"`
	Text string `json:"text"`
}
type Patch struct {
	Base   string `json:"base_sha256"`
	Target string `json:"target_sha256"`
	Edits  []Edit `json:"edits"`
}
type Stats struct {
	Inserted int `json:"inserted"`
	Deleted  int `json:"deleted"`
	Equal    int `json:"equal"`
}
type Diff struct {
	Engine string `json:"engine"`
	Stats  Stats  `json:"stats"`
	Patch  Patch  `json:"patch"`
}
type Applied struct {
	Engine   string `json:"engine"`
	Text     string `json:"text"`
	SHA      string `json:"sha256"`
	Verified bool   `json:"verified"`
}
type Failure struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"status"`
}
type Request struct {
	Action string  `json:"action"`
	Before *string `json:"before"`
	After  *string `json:"after"`
	Patch  *Patch  `json:"patch"`
}

func hash(text string) string { h := sha256.Sum256([]byte(text)); return hex.EncodeToString(h[:]) }
func lines(text string) []string {
	if text == "" {
		return []string{}
	}
	return strings.Split(text, "\n")
}
func valid(text string) bool {
	return utf8.ValidString(text) && len(text) <= 4096 && len(lines(text)) <= 120
}
func failure(code, msg string, status int) *Failure { return &Failure{code, msg, status} }

func compare(before, after string) (Diff, *Failure) {
	if !valid(before) || !valid(after) {
		return Diff{}, failure("text_limit", "Texts require valid UTF-8, at most 4096 bytes and 120 LF tokens.", 422)
	}
	a, b := lines(before), lines(after)
	n, m := len(a), len(b)
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = 1 + dp[i+1][j+1]
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}
	edits := make([]Edit, 0, n+m)
	stats := Stats{}
	i, j := 0, 0
	for i < n || j < m {
		if i < n && j < m && a[i] == b[j] {
			edits = append(edits, Edit{"equal", a[i]})
			stats.Equal++
			i++
			j++
		} else if i < n && (j == m || dp[i+1][j] >= dp[i][j+1]) {
			edits = append(edits, Edit{"delete", a[i]})
			stats.Deleted++
			i++
		} else {
			edits = append(edits, Edit{"insert", b[j]})
			stats.Inserted++
			j++
		}
	}
	return Diff{"go-wasi", stats, Patch{hash(before), hash(after), edits}}, nil
}
func digest(s string) bool {
	if len(s) != 64 || strings.ToLower(s) != s {
		return false
	}
	_, err := hex.DecodeString(s)
	return err == nil
}
func apply(before string, p Patch) (Applied, *Failure) {
	if !valid(before) || len(p.Edits) > 240 || !digest(p.Base) || !digest(p.Target) {
		return Applied{}, failure("invalid_patch", "Invalid text, digest or edit count.", 422)
	}
	if hash(before) != p.Base {
		return Applied{}, failure("base_conflict", "Base SHA-256 does not match.", 409)
	}
	original := lines(before)
	output := []string{}
	cursor, total := 0, 0
	for _, e := range p.Edits {
		total += len(e.Text)
		if strings.Contains(e.Text, "\n") || total > 8192 || !utf8.ValidString(e.Text) {
			return Applied{}, failure("invalid_patch", "Edit text exceeds limits or contains LF.", 422)
		}
		switch e.Op {
		case "equal", "delete":
			if cursor >= len(original) || original[cursor] != e.Text {
				return Applied{}, failure("patch_conflict", "Edit does not match the next base token.", 409)
			}
			if e.Op == "equal" {
				output = append(output, e.Text)
			}
			cursor++
		case "insert":
			output = append(output, e.Text)
		default:
			return Applied{}, failure("invalid_patch", "Unknown edit operation.", 422)
		}
	}
	if cursor != len(original) {
		return Applied{}, failure("patch_conflict", "Patch does not consume the entire base.", 409)
	}
	text := strings.Join(output, "\n")
	if !valid(text) {
		return Applied{}, failure("text_limit", "Result exceeds text limits.", 422)
	}
	if hash(text) != p.Target {
		return Applied{}, failure("target_conflict", "Result SHA-256 does not match target.", 409)
	}
	return Applied{"go-wasi", text, hash(text), true}, nil
}
func run(req Request) (any, *Failure) {
	if req.Before == nil {
		return nil, failure("invalid_request", "before is required.", 422)
	}
	switch req.Action {
	case "diff":
		if req.After == nil || req.Patch != nil {
			return nil, failure("invalid_request", "diff requires after and forbids patch.", 422)
		}
		return compare(*req.Before, *req.After)
	case "apply":
		if req.Patch == nil || req.After != nil {
			return nil, failure("invalid_request", "apply requires patch and forbids after.", 422)
		}
		return apply(*req.Before, *req.Patch)
	default:
		return nil, failure("invalid_request", "Unknown action.", 422)
	}
}
func main() {
	defer func() {
		if recover() != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"error": failure("engine_error", "Engine failed.", 500)})
		}
	}()
	bytes, err := io.ReadAll(io.LimitReader(os.Stdin, 131073))
	if err != nil || len(bytes) > 131072 {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"error": failure("body_limit", "Input too large.", 413)})
		return
	}
	var req Request
	decoder := json.NewDecoder(strings.NewReader(string(bytes)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&req) != nil {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"error": failure("invalid_request", "Invalid request JSON.", 422)})
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"error": failure("invalid_request", "Trailing input.", 422)})
		return
	}
	result, fail := run(req)
	var envelope any
	if fail != nil {
		envelope = map[string]any{"error": fail}
	} else {
		envelope = map[string]any{"data": result}
	}
	if err := json.NewEncoder(os.Stdout).Encode(envelope); err != nil {
		fmt.Fprintln(os.Stderr, "response encoding failed")
	}
}
