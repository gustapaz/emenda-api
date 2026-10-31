"use client";
import { useState } from "react";
type Meta = {
  primary: string;
  secondary: string;
  primaryLabel: string;
  secondaryLabel: string;
  examples: { name: string; input: unknown }[];
};
export default function Playground({ meta }: { meta: Meta }) {
  const [input, setInput] = useState(
      JSON.stringify(meta.examples[0].input, null, 2),
    ),
    [result, setResult] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Pronto para consultar a API.");
  async function run(path: string) {
    setBusy(true);
    setResult(null);
    try {
      const body = JSON.stringify(JSON.parse(input));
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const value = await response.json();
      setResult(value);
      setStatus(
        "HTTP " +
          response.status +
          " · " +
          (response.ok
            ? "Processamento concluído no servidor."
            : "A API recusou a entrada."),
      );
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Falha ao consultar o serviço.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="lab" aria-labelledby="lab-title">
      <div className="entry">
        <h2 id="lab-title">Laboratório da API</h2>
        <div className="examples">
          {meta.examples.map((e, i) => (
            <button
              key={i}
              disabled={busy}
              onClick={() => {
                setInput(JSON.stringify(e.input, null, 2));
                setResult(null);
                setStatus("Exemplo carregado. Envie para calcular.");
              }}
            >
              {e.name}
            </button>
          ))}
        </div>
        <label htmlFor="request">Corpo da requisição · JSON</label>
        <textarea
          id="request"
          rows={19}
          value={input}
          disabled={busy}
          onChange={(e) => {
            setInput(e.target.value);
            setResult(null);
            setStatus("Entrada alterada. Envie novamente.");
          }}
          spellCheck={false}
        />
        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(meta.primary)}
          >
            {busy ? "Processando…" : meta.primaryLabel}
          </button>
          <button disabled={busy} onClick={() => run(meta.secondary)}>
            {meta.secondaryLabel}
          </button>
        </div>
        <p className="small">
          Dados sintéticos. O processamento é feito no servidor. Nenhuma conta
          ou arquivo é armazenado.
        </p>
      </div>
      <div className="response">
        <span className="eyebrow">RESPOSTA DO SERVIDOR</span>
        <p role="status" aria-live="polite">
          {status}
        </p>
        {result === null ? (
          <div className="empty">
            Escolha um exemplo, edite o JSON e execute uma operação.
            <br />
            <br />O contrato completo está no Swagger.
          </div>
        ) : (
          <pre aria-label="Resultado JSON">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
