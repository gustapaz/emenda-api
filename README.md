# Emenda API

Compare revisões de texto e aplique alterações com pré-condições SHA-256. Motor Go real, executado no servidor em WASI, com diferenças mínimas por tokens de linha.

**Stack: Go 1.27 + WASI/WebAssembly.**

[Demo](https://emenda-api-gustapaz.starrylinen.chatgpt.site) · [Swagger](https://emenda-api-gustapaz.starrylinen.chatgpt.site/docs.html) · [OpenAPI](https://emenda-api-gustapaz.starrylinen.chatgpt.site/api/openapi.json)

## Recursos

O diff usa LCS e prefere remoção em empates. O patch inclui o hash da base e do destino, confere cada token e exige consumir a base inteira. Uma base divergente ou patch adulterado retorna conflito.

Exemplos sintéticos, processamento real no servidor. Não há serviços externos simulando os cálculos.

## Executar localmente

Node.js 24, npm e Go 1.27.x. GO_BIN pode apontar para um executável Go fora do PATH. O motor usa somente a biblioteca padrão.

```sh
npm ci
npm run build
npm start -- --port 5221
```

Abra http://127.0.0.1:5221 e /docs.html. Não exige conta cloud, banco, cartão ou segredo. O serviço não precisa guardar dados entre requisições; não há migração ou persistência prometida.

```sh
npm run build:engine
npm run check
npm run typecheck
npm test
npm run smoke -- http://127.0.0.1:5221
```

25 testes Node/HTTP, testes Go nativos e 100 pares de textos com seed fixa, comparados com um oráculo LCS independente. Cobrem integridade do patch, conflitos, Unicode, CRLF, limites, isolamento e roundtrip exato. A CI instala do lockfile, compila o motor e Worker, verifica formatação/tipos e executa testes. Os tipos TypeScript cobrem o adaptador e a interface; o núcleo é Go 1.27 + WASI/WebAssembly.

## API

```sh
curl https://emenda-api-gustapaz.starrylinen.chatgpt.site/api/health
curl -X POST https://emenda-api-gustapaz.starrylinen.chatgpt.site/api/v1/diff -H 'Content-Type: application/json' --data-binary @examples/requests/example-1.json
curl -X POST https://emenda-api-gustapaz.starrylinen.chatgpt.site/api/v1/roundtrip -H 'Content-Type: application/json' --data-binary @examples/requests/example-1.json
```

GET /api/v1/examples retorna três entradas executáveis. O health roda o motor antes de retornar engine_check:true. O contrato Swagger detalha payloads e respostas. Erros usam application/problem+json e request_id: JSON/UTF-8 inválido 400, Origin diferente 403, rota desconhecida 404, conflito de patch 409 quando aplicável, tamanho 413, mídia 415 e contrato 422.

## Semântica e limites

Textos são sequências de tokens separados por LF. Texto vazio tem zero tokens; newline final cria um token vazio terminal. CRLF, Unicode e NUL são preservados. LCS minimiza inserções/remoções de tokens e prefere remoção em empates. Patches manuais não precisam ser mínimos, mas devem consumir a base inteira e produzir o hash de destino. SHA-256 verifica conteúdo, não identidade ou assinatura. Limites: 4096 bytes UTF-8 e 120 tokens por texto, 240 operações por patch e 128 KiB por corpo JSON.

Até 4096 bytes UTF-8 e 120 tokens LF por texto; até 240 operações por patch e 128 KiB por corpo JSON. Preserva CRLF e newline final. SHA-256 verifica conteúdo, sem assinatura ou identidade.

## Arquitetura e hospedagem

[Arquitetura](docs/architecture.md) · [Segurança](docs/security.md)

engine/main.go contém diff, aplicação de patch e digests SHA-256. O build executa go test nativo e compila GOOS=wasip1/GOARCH=wasm. Cada cálculo cria uma instância WASM, com stdin/stdout em memória e sem diretórios preabertos ou rede. Não é permitido enviar código Go/WASM: somente os dados do protocolo. server/core.mjs faz a ponte WASI e valida limites antes de chamar o motor. Os três endpoints são /api/v1/diff, /api/v1/apply e /api/v1/roundtrip.

Vinext/React é o adaptador Worker e o cliente técnico; as regras não executam no navegador. Inputs/resultados ficam no escopo da requisição e na memória da página.

Demo em Sites sem cartão, faturamento, trial ou plano pago ativado. GitHub hospeda código/CI; Pages não executa a API. Disponibilidade e cotas dependem da hospedagem, sem SLA ou promessa de gratuidade permanente. Não há rate limit global próprio; o trabalho por chamada é limitado. Use apenas dados sintéticos. Nenhuma variável secreta é obrigatória; veja .env.example.

## Licença

Código do projeto sob MIT. Go BSD e as licenças MIT/Apache do shim WASI são preservadas em vendor/. Swagger UI conserva LICENSE e NOTICE em public/swagger/. O tooling Sites/Vinext mantém seus avisos em vendor/ e scripts/vite/sites-vite-plugin.LICENSE.
