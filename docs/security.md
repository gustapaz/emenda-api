# Segurança e operação

Até 4096 bytes UTF-8 e 120 tokens LF por texto; até 240 operações por patch e 128 KiB por corpo JSON. Preserva CRLF e newline final. SHA-256 verifica conteúdo, sem assinatura ou identidade.

O stream conta bytes efetivos, sem confiar em Content-Length. Corpos comprimidos, propriedades desconhecidas, tipos e quantidades fora do contrato são recusados. Não existe execução de código enviado pelo usuário.

Origin de navegador deve coincidir com o serviço. Clientes sem Origin são aceitos; isso não é autenticação. Não há contas, cookies, segredos de demonstração ou ações sobre dados persistidos. Respostas incluem no-store, nosniff, Referrer-Policy e request IDs. Erros não expõem stack traces ou payloads.

A aplicação não registra entradas; a infraestrutura pode registrar metadados. Use somente dados sintéticos. Sem rate limit global ou DDoS próprio. O processamento é limitado, mas a disponibilidade depende da plataforma. Nenhum cartão, faturamento, trial ou plano pago foi ativado.

engine/main.go contém diff, aplicação de patch e digests SHA-256. O build executa go test nativo e compila GOOS=wasip1/GOARCH=wasm. Cada cálculo cria uma instância WASM, com stdin/stdout em memória e sem diretórios preabertos ou rede. Não é permitido enviar código Go/WASM: somente os dados do protocolo. server/core.mjs faz a ponte WASI e valida limites antes de chamar o motor. Os três endpoints são /api/v1/diff, /api/v1/apply e /api/v1/roundtrip.

Os testes comprovam comportamentos específicos, sem certificar ausência universal de vulnerabilidades.
