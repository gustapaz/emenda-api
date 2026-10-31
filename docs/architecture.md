# Arquitetura

engine/main.go contém diff, aplicação de patch e digests SHA-256. O build executa go test nativo e compila GOOS=wasip1/GOARCH=wasm. Cada cálculo cria uma instância WASM, com stdin/stdout em memória e sem diretórios preabertos ou rede. Não é permitido enviar código Go/WASM: somente os dados do protocolo. server/core.mjs faz a ponte WASI e valida limites antes de chamar o motor. Os três endpoints são /api/v1/diff, /api/v1/apply e /api/v1/roundtrip.

Textos são sequências de tokens separados por LF. Texto vazio tem zero tokens; newline final cria um token vazio terminal. CRLF, Unicode e NUL são preservados. LCS minimiza inserções/remoções de tokens e prefere remoção em empates. Patches manuais não precisam ser mínimos, mas devem consumir a base inteira e produzir o hash de destino. SHA-256 verifica conteúdo, não identidade ou assinatura. Limites: 4096 bytes UTF-8 e 120 tokens por texto, 240 operações por patch e 128 KiB por corpo JSON.

A camada HTTP valida media type, UTF-8 e tamanho do stream. server/service.mjs define contratos e operações; server/meta.mjs contém dados sintéticos. Os testes usam o motor real, sem mocks.

25 testes Node/HTTP, testes Go nativos e 100 pares de textos com seed fixa, comparados com um oráculo LCS independente. Cobrem integridade do patch, conflitos, Unicode, CRLF, limites, isolamento e roundtrip exato.
