export const meta = {
  repo: "emenda-api",
  title: "Emenda API",
  engine: "go-wasi",
  accent: "#854b20",
  headline: "Um patch precisa provar onde se aplica.",
  description:
    "Compare revisões de texto e aplique alterações com pré-condições SHA-256. Motor Go real, executado no servidor em WASI, com diferenças mínimas por tokens de linha.",
  behavior:
    "O diff usa LCS e prefere remoção em empates. O patch inclui o hash da base e do destino, confere cada token e exige consumir a base inteira. Uma base divergente ou patch adulterado retorna conflito.",
  limits:
    "Até 4096 bytes UTF-8 e 120 tokens LF por texto; até 240 operações por patch e 128 KiB por corpo JSON. Preserva CRLF e newline final. SHA-256 verifica conteúdo, sem assinatura ou identidade.",
  primary: "/api/v1/diff",
  secondary: "/api/v1/roundtrip",
  primaryLabel: "Calcular diff →",
  secondaryLabel: "Verificar ida e volta",
  examples: [
    {
      name: "Alteração de linha",
      input: { before: "alfa\nbeta", after: "alfa\ngama" },
      expected: { "stats.inserted": 1, "stats.deleted": 1, "stats.equal": 1 },
    },
    {
      name: "Newline final",
      input: { before: "linha", after: "linha\n" },
      expected: { "stats.inserted": 1, "stats.deleted": 0 },
    },
    {
      name: "Unicode",
      input: { before: "🦊\ntexto", after: "🦊\noutro" },
      expected: { "stats.equal": 1, "stats.deleted": 1 },
    },
  ],
  secondaryExpected: { verified: true },
};
