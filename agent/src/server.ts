import http from 'node:http'
import { LouvorFlowAgent } from './agent.js'
import { saveConfig } from './config.js'

/**
 * Servidor Web local leve (http://localhost:8765)
 * Mostra status em tempo real, permite parear com LouvorFlow e configurar Holyrics
 */
export function startAgentWebServer(agent: LouvorFlowAgent, port = 8765) {
  const server = http.createServer(async (req, res) => {
    // Configura headers CORS para requisições locais
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    // 1. API: GET /api/status
    if (req.method === 'GET' && parsedUrl.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(agent.getStatusInfo()))
      return
    }

    // 2. API: POST /api/pair
    if (req.method === 'POST' && parsedUrl.pathname === '/api/pair') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}')
          const code = String(data.pairing_code || '').trim()
          const saasUrl = data.saas_url ? String(data.saas_url).trim() : undefined
          const pairRes = await agent.pairWithCode(code, saasUrl)
          res.writeHead(pairRes.success ? 200 : 400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(pairRes))
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: err.message }))
        }
      })
      return
    }

    // 3. API: POST /api/holyrics/test
    if (req.method === 'POST' && parsedUrl.pathname === '/api/holyrics/test') {
      const testRes = await agent.testHolyrics()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(testRes))
      return
    }

    // 4. API: POST /api/config
    if (req.method === 'POST' && parsedUrl.pathname === '/api/config') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}')
          const updates: any = {}
          if (data.holyrics_host) updates.holyricsHost = String(data.holyrics_host).trim()
          if (data.holyrics_port) updates.holyricsPort = Number(data.holyrics_port) || 8091
          if (typeof data.holyrics_token === 'string')
            updates.holyricsToken = data.holyrics_token.trim()
          if (data.saas_url) updates.saasUrl = String(data.saas_url).trim()

          saveConfig(updates)
          agent.updateConfig(updates)
          const testRes = await agent.testHolyrics()

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: true, message: 'Configurações salvas.', holyrics: testRes }),
          )
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, message: err.message }))
        }
      })
      return
    }

    // 5. HTML Interface (Dashboard local do Agent)
    if (
      req.method === 'GET' &&
      (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html')
    ) {
      const status = agent.getStatusInfo()
      const html = renderHtmlDashboard(status)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Agent Web] Painel local disponível em http://localhost:${port}`)
  })

  return server
}

function renderHtmlDashboard(status: AgentStatusInfo): string {
  const isAgentConnected = status.agentStatus === 'CONNECTED'
  const isHolyricsDetected = status.holyricsStatus === 'DETECTED'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LouvorFlow Agent — Holyrics Local Bridge</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #0d9488;
      --primary-hover: #0f766e;
      --green: #10b981;
      --red: #ef4444;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 680px; display: flex; flex-direction: column; gap: 20px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--card-border); }
    .logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.25rem; }
    .logo-badge { background: var(--primary); color: white; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; }
    .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .card-title { font-size: 0.95rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between; }
    .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .status-box { background: #0f172a; border: 1px solid var(--card-border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
    .status-label { font-size: 0.75rem; color: var(--text-muted); }
    .status-val { font-size: 0.95rem; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-green { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .dot-red { background: var(--red); box-shadow: 0 0 8px var(--red); }
    .dot-amber { background: var(--amber); box-shadow: 0 0 8px var(--amber); }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
    input { background: #0f172a; border: 1px solid var(--card-border); border-radius: 6px; padding: 10px 12px; color: var(--text); font-size: 0.9rem; outline: none; }
    input:focus { border-color: var(--primary); }
    .btn { background: var(--primary); color: white; border: none; border-radius: 6px; padding: 10px 16px; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .btn:hover { background: var(--primary-hover); }
    .btn-secondary { background: #334155; }
    .btn-secondary:hover { background: #475569; }
    .alert { padding: 12px; border-radius: 6px; font-size: 0.85rem; line-height: 1.4; display: none; }
    .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid var(--green); color: #6ee7b7; }
    .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid var(--red); color: #fca5a5; }
    .alert-amber { background: rgba(245, 158, 11, 0.15); border: 1px solid var(--amber); color: #fcd34d; }
    .row { display: flex; gap: 10px; }
    .row > * { flex: 1; }
    .footnote { font-size: 0.75rem; color: var(--text-muted); text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <span>LouvorFlow Agent</span>
        <span class="logo-badge">v0.0.15</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">
        ${status.machineName}
      </div>
    </div>

    <!-- Status Cards -->
    <div class="card">
      <div class="card-title">
        <span>Status dos Serviços</span>
        <button id="btnRefresh" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;">Atualizar</button>
      </div>

      <div class="status-grid">
        <div class="status-box">
          <span class="status-label">Status do Agent</span>
          <div class="status-val">
            <span class="dot ${isAgentConnected ? 'dot-green' : 'dot-red'}"></span>
            ${isAgentConnected ? '🟢 Conectado ao LouvorFlow' : '🔴 Desconectado'}
          </div>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${status.churchName || 'Igreja não vinculada'}</span>
        </div>

        <div class="status-box">
          <span class="status-label">Holyrics Local API</span>
          <div class="status-val">
            <span class="dot ${isHolyricsDetected ? 'dot-green' : 'dot-red'}"></span>
            ${isHolyricsDetected ? '🟢 Conectada (OK)' : '🔴 Não detectado'}
          </div>
          <span style="font-size: 0.7rem; color: var(--text-muted);">
            ${status.holyricsHost}:${status.holyricsPort} ${status.holyricsVersion ? `(v${status.holyricsVersion})` : ''}
          </span>
        </div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button id="btnTestHolyrics" class="btn btn-secondary" style="flex: 1;">Testar Conexão Holyrics</button>
      </div>

      <div id="testAlert" class="alert"></div>
    </div>

    <!-- Pareamento com o LouvorFlow -->
    <div class="card">
      <div class="card-title">Conectar ao LouvorFlow (Pareamento)</div>
      <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4;">
        No SaaS, acesse <strong>Configurações → Integrações → Holyrics → [Conectar computador]</strong> para gerar o código de 6 dígitos.
      </p>

      <div class="row">
        <div class="form-group" style="flex: 2;">
          <label>Código de Pareamento</label>
          <input type="text" id="pairCode" placeholder="Ex: 847 291" style="font-size: 1.1rem; font-weight: 700; letter-spacing: 0.1em; text-align: center;">
        </div>
        <div style="display: flex; align-items: flex-end; flex: 1;">
          <button id="btnPair" class="btn" style="width: 100%; height: 42px;">Conectar</button>
        </div>
      </div>

      <div id="pairAlert" class="alert"></div>
    </div>

    <!-- Configuração Local do Holyrics -->
    <div class="card">
      <div class="card-title">Configurações Locais do Holyrics</div>
      <p style="font-size: 0.75rem; color: var(--text-muted);">
        O token fica SOMENTE neste computador (arquivo agent.config.json com permissão restrita). Nunca é enviado ao servidor nem ao banco.
      </p>

      <div class="row">
        <div class="form-group">
          <label>Host</label>
          <input type="text" id="holyricsHost" value="${status.holyricsHost}">
        </div>
        <div class="form-group" style="max-width: 110px;">
          <label>Porta</label>
          <input type="number" id="holyricsPort" value="${status.holyricsPort}">
        </div>
      </div>

      <div class="form-group">
        <label>Token de Acesso do Holyrics (API Server)</label>
        <input type="password" id="holyricsToken" placeholder="${status.holyricsHasToken ? '••••••••••••••••' : 'Cole aqui o token criado no Holyrics'}" autocomplete="off">
        <span style="font-size: 0.7rem; color: var(--text-muted);">
          No Holyrics: Menu Arquivo &gt; Configurações &gt; API Server &gt; Ativar e Gerenciar permissões.
        </span>
      </div>

      <button id="btnSaveConfig" class="btn btn-secondary">Salvar Configurações</button>
      <div id="configAlert" class="alert"></div>
    </div>

    <div class="footnote">
      LouvorFlow Agent • Comunicação 100% de saída para o SaaS • Sem portas abertas na internet
    </div>
  </div>

  <script>
    const showAlert = (el, type, msg) => {
      el.className = 'alert ' + (type === 'success' ? 'alert-success' : type === 'amber' ? 'alert-amber' : 'alert-error');
      el.innerText = msg;
      el.style.display = 'block';
    };

    // Testar Holyrics
    document.getElementById('btnTestHolyrics').addEventListener('click', async () => {
      const btn = document.getElementById('btnTestHolyrics');
      const alert = document.getElementById('testAlert');
      btn.innerText = 'Testando...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/holyrics/test', { method: 'POST' });
        const data = await res.json();
        showAlert(alert, data.connected && data.tokenValid ? 'success' : data.connected ? 'amber' : 'error', data.message);
      } catch (e) {
        showAlert(alert, 'error', 'Erro ao testar: ' + e.message);
      } finally {
        btn.innerText = 'Testar Conexão Holyrics';
        btn.disabled = false;
      }
    });

    // Parear
    document.getElementById('btnPair').addEventListener('click', async () => {
      const btn = document.getElementById('btnPair');
      const alert = document.getElementById('pairAlert');
      const code = document.getElementById('pairCode').value.trim();
      if (!code) {
        showAlert(alert, 'error', 'Informe o código de 6 dígitos gerado no LouvorFlow.');
        return;
      }
      btn.innerText = 'Conectando...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairing_code: code })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(alert, 'success', '✓ Pareado com sucesso à congregação: ' + (data.church_name || 'Igreja'));
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(alert, 'error', data.message || 'Código inválido ou expirado.');
        }
      } catch (e) {
        showAlert(alert, 'error', 'Falha ao conectar: ' + e.message);
      } finally {
        btn.innerText = 'Conectar';
        btn.disabled = false;
      }
    });

    // Salvar Configurações Holyrics
    document.getElementById('btnSaveConfig').addEventListener('click', async () => {
      const btn = document.getElementById('btnSaveConfig');
      const alert = document.getElementById('configAlert');
      const host = document.getElementById('holyricsHost').value.trim();
      const port = Number(document.getElementById('holyricsPort').value) || 8091;
      const token = document.getElementById('holyricsToken').value.trim();

      btn.innerText = 'Salvando...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ holyrics_host: host, holyrics_port: port, holyrics_token: token })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(alert, 'success', 'Configurações salvas! ' + (data.holyrics ? data.holyrics.message : ''));
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showAlert(alert, 'error', data.message || 'Erro ao salvar.');
        }
      } catch (e) {
        showAlert(alert, 'error', 'Erro ao salvar: ' + e.message);
      } finally {
        btn.innerText = 'Salvar Configurações';
        btn.disabled = false;
      }
    });

    document.getElementById('btnRefresh').addEventListener('click', () => window.location.reload());
  </script>
</body>
</html>`
}
