package main

import "testing"

func TestRoundTrip(t *testing.T) {
	for _, p := range [][2]string{{"", ""}, {"a", "a\n"}, {"a\r\nb", "b\r\na"}, {"🦊\nlinha", "🦊\noutra"}, {"a\nb\na", "b\na\nb"}} {
		d, e := compare(p[0], p[1])
		if e != nil {
			t.Fatal(e)
		}
		got, e := apply(p[0], d.Patch)
		if e != nil || got.Text != p[1] {
			t.Fatalf("roundtrip failed: %v", e)
		}
	}
}
func TestMinimalAndConflict(t *testing.T) {
	d, e := compare("a\nb", "a\nc")
	if e != nil || d.Stats.Inserted != 1 || d.Stats.Deleted != 1 {
		t.Fatal("wrong edits")
	}
	if _, e := apply("wrong", d.Patch); e == nil || e.Status != 409 {
		t.Fatal("base conflict missing")
	}
	d.Patch.Edits[0].Text = "tampered"
	if _, e := apply("a\nb", d.Patch); e == nil {
		t.Fatal("tampered patch accepted")
	}
}
func TestLimits(t *testing.T) {
	if _, e := compare(string(make([]byte, 4097)), ""); e == nil {
		t.Fatal("missing text limit")
	}
	if _, e := run(Request{Action: "diff"}); e == nil {
		t.Fatal("missing input accepted")
	}
}
