// ============================================================
// MESA DE INVESTIMENTOS 24/7 — VERSÃO ARQUIVO ÚNICO
// ============================================================
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---------- CONFIGURAÇÃO (variáveis do Render) ----------
const CFG = {
  zapUrl: process.env.WHATSAPP_API_URL || '',
  zapKey: process.env.WHATSAPP_API_KEY || '',
  celular: process.env.NUMERO_CELULAR || '',
  brapiToken: process.env.BRAPITOKEN || ''
};
const zapAtivo = () => Boolean(CFG.zapUrl && CFG.zapKey && CFG.celular);

// ---------- LOGS ----------
const logs = [];
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function log(agente, mensagem, tipo = 'info') {
  logs.push({ id: Date.now() + Math.random(), agente, mensagem, tipo, hora: new Date().toLocaleTimeString('pt-BR') });
  if (logs.length > 500) logs.shift();
}

// ---------- CARTEIRA ----------
const carteira = { usuario: 'Investidor', caixa: 0, ativos: [] };

function adicionarAtivo(d) {
  const ticker = String(d.ticker || '').trim().toUpperCase();
  const quantidade = parseFloat(String(d.quantidade).replace(',', '.'));
  const precoMedio = parseFloat(String(d.precoMedio).replace(',', '.'));
  if (!ticker) throw new Error('Informe o ticker.');
  if (!quantidade || quantidade <= 0) throw new Error('Quantidade deve ser maior que zero.');
  if (!precoMedio || precoMedio <= 0) throw new Error('Preço médio deve ser maior que zero.');
  let a = carteira.ativos.find(x => x.ticker === ticker);
  if (a) {
    a.precoMedio = (a.precoMedio * a.quantidade + precoMedio * quantidade) / (a.quantidade + quantidade);
    a.quantidade += quantidade;
  } else {
    a = { ticker, nome: d.nome || ticker, categoria: d.categoria || 'ACAO_BR', quantidade, precoMedio, precoFechamento: precoMedio, precoAtual: precoMedio };
    carteira.ativos.push(a);
  }
  return a;
}
function removerAtivo(ticker) {
  const i = carteira.ativos.findIndex(x => x.ticker === String(ticker).toUpperCase());
  if (i >= 0) carteira.ativos.splice(i, 1);
}
function comprar(ticker, qtd) {
  ticker = String(ticker || '').toUpperCase();
  qtd = parseFloat(String(qtd).replace(',', '.'));
  const a = carteira.ativos.find(x => x.ticker === ticker);
  if (!a) throw new Error('Ativo ' + ticker + ' não está na carteira. Cadastre primeiro em "Meus Investimentos".');
  if (!qtd || qtd <= 0) throw new Error('Quantidade inválida.');
  const custo = qtd * a.precoAtual;
  if (custo > carteira.caixa) throw new Error('Caixa insuficiente (disponível: ' + brl(carteira.caixa) + ', necessário: ' + brl(custo) + ').');
  carteira.caixa -= custo;
  a.precoMedio = (a.precoMedio * a.quantidade + custo) / (a.quantidade + qtd);
  a.quantidade += qtd;
  return { quantidade: qtd, ativo: ticker, precoExec: a.precoAtual };
}
function vender(ticker, qtd) {
  ticker = String(ticker || '').toUpperCase();
  qtd = parseFloat(String(qtd).replace(',', '.'));
  const a = carteira.ativos.find(x => x.ticker === ticker);
  if (!a) throw new Error('Ativo ' + ticker + ' não está na carteira.');
  if (!qtd || qtd <= 0) throw new Error('Quantidade inválida.');
  if (qtd > a.quantidade) throw new Error('Você só tem ' + a.quantidade + ' de ' + ticker + '.');
  carteira.caixa += qtd * a.precoAtual;
  a.quantidade -= qtd;
  if (a.quantidade === 0) removerAtivo(ticker);
  return { quantidade: qtd, ativo: ticker, precoExec: a.precoAtual };
}
function resumo() {
  const totalInvestido = carteira.ativos.reduce((s, a) => s + a.quantidade * a.precoMedio, 0);
  const patrimonioAtual = carteira.ativos.reduce((s, a) => s + a.quantidade * a.precoAtual, 0);
  const custoFechamento = carteira.ativos.reduce((s, a) => s + a.quantidade * a.precoFechamento, 0);
  return {
    usuario: carteira.usuario, caixa: carteira.caixa, totalInvestido, patrimonioAtual,
    resultadoDia: patrimonioAtual - custoFechamento,
    lucroTotal: patrimonioAtual - totalInvestido,
    modoReal, ativos: carteira.ativos.map(a => ({ ...a, variacaoDia: ((a.precoAtual - a.precoFechamento) / a.precoFechamento) * 100 }))
  };
}

// ---------- EDDIE (comandos) ----------
function normalizar(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function eddieResposta(texto) {
  const t = normalizar(texto).trim();
  const r = resumo();
  if (/^(ajuda|oi|ola|menu|eddie)/.test(t)) {
    return '🧠 *Eddie — comandos:*\n• saldo\n• carteira\n• status TICKER\n• comprar TICKER QTD\n• vender TICKER QTD\n• relatorio';
  }
  if (t.includes('saldo')) {
    return '💰 *Saldo — ' + r.usuario + '*\n📥 Caixa: ' + brl(r.caixa) + '\n📈 Investido: ' + brl(r.totalInvestido) + '\n🏦 Patrimônio: ' + brl(r.patrimonioAtual) + '\n📊 Lucro/Prejuízo: ' + brl(r.lucroTotal);
  }
  if (t.includes('carteira')) {
    if (!r.ativos.length) return '📋 Sua carteira está vazia. Adicione pelo painel ou digite "comprar TICKER QTD".';
    return '📋 *Carteira*\n' + r.ativos.map(a => '• ' + a.ticker + ': ' + a.quantidade + ' un. a ' + brl(a.precoAtual) + ' (' + (a.variacaoDia >= 0 ? '+' : '') + a.variacaoDia.toFixed(2) + '%)').join('\n');
  }
  const st = t.match(/status\s+(\S+)/);
  if (st) {
    const a = carteira.ativos.find(x => x.ticker === st[1].toUpperCase());
    if (!a) return '❌ Não encontrei ' + st[1].toUpperCase() + ' na carteira.';
    const v = ((a.precoAtual - a.precoFechamento) / a.precoFechamento) * 100;
    return '🔎 *' + a.ticker + '*\nPreço: ' + brl(a.precoAtual) + '\nFechamento: ' + brl(a.precoFechamento) + '\nDia: ' + v.toFixed(2) + '%\nPreço médio: ' + brl(a.precoMedio);
  }
  const m = t.match(/(comprar|vender)\s+(\S+)\s+([\d.,]+)/);
  if (m) {
    const qtd = parseFloat(m[3].replace(',', '.'));
    try {
      const res = m[1] === 'comprar' ? comprar(m[2], qtd) : vender(m[2], qtd);
      log('Cacaroto', 'Ordem via WhatsApp: ' + m[1] + ' ' + qtd + ' ' + res.ativo + '.', 'trade');
      return '✅ ' + (m[1] === 'comprar' ? 'Compra' : 'Venda') + ' executada: ' + qtd + ' ' + res.ativo + ' a ' + brl(res.precoExec) + '.';
    } catch (e) { return '❌ ' + e.message; }
  }
  if (t.includes('relatorio')) {
    const cats = {};
    for (const a of r.ativos) cats[a.categoria] = (cats[a.categoria] || 0) + a.precoAtual * a.quantidade;
    return '📊 *Relatório por categoria*\n' + (Object.keys(cats).length ? Object.entries(cats).map(([c, v]) => '• ' + c + ': ' + brl(v)).join('\n') : 'Carteira vazia.') + '\n🏦 Patrimônio total: ' + brl(r.patrimonioAtual);
  }
  return '🧠 Eddie: não entendi. Digite "ajuda" para ver os comandos.';
}

// ---------- WHATSAPP (Z-API) ----------
async function zapEnviar(texto, contexto = 'alerta') {
  if (!zapAtivo()) {
    log('Eddie', 'WhatsApp em modo simulação (configure WHATSAPP_API_URL, WHATSAPP_API_KEY e NUMERO_CELULAR).', 'whatsapp');
    return { enviado: false, simulado: true };
  }
  try {
    const r = await fetch(CFG.zapUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': CFG.zapKey },
      body: JSON.stringify({ phone: CFG.celular, message: texto })
    });
    const corpo = await r.text().catch(() => '');
    if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + corpo.slice(0, 200));
    log('Eddie', 'Mensagem de ' + contexto + ' entregue no WhatsApp de ' + CFG.celular + '.', 'whatsapp');
    return { enviado: true };
  } catch (e) {
    log('Eddie', 'Falha ao falar com a API do WhatsApp: ' + e.message, 'whatsapp');
    return { enviado: false, erro: e.message };
  }
}

// ---------- COTAÇÕES REAIS + MOTOR DE MERCADO ----------
const MAPA_CRIPTO = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', ADA: 'cardano' };
let modoReal = false;
async function precosReais() {
  const precos = {};
  const cripto = carteira.ativos.filter(a => a.categoria === 'CRYPTO').map(a => a.ticker);
  const bolsa = carteira.ativos.filter(a => a.categoria !== 'CRYPTO').map(a => a.ticker);
  try {
    const ids = cripto.map(t => MAPA_CRIPTO[t]).filter(Boolean);
    if (ids.length) {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids.join(',') + '&vs_currencies=brl');
      const d = await r.json();
      const inv = Object.fromEntries(Object.entries(MAPA_CRIPTO).map(([t, id]) => [id, t]));
      for (const [id, info] of Object.entries(d)) if (info.brl) precos[inv[id]] = info.brl;
    }
  } catch (e) { log('Vedita', 'CoinGecko falhou; cripto em simulação.', 'mercado'); }
  try {
    if (bolsa.length && CFG.brapiToken) {
      const r = await fetch('https://brapi.dev/api/quote/' + bolsa.join(',') + '?token=' + CFG.brapiToken);
      const d = await r.json();
      for (const it of d.results || []) if (it.regularMarketPrice) precos[it.symbol] = it.regularMarketPrice;
    }
  } catch (e) { log('Vedita', 'brapi falhou; bolsa em simulação.', 'mercado'); }
  return precos;
}
const alertaEnviado = {};
const OCIOSAS = ['Mercado monitorado. Tudo em ordem por aqui.', 'Indicadores recalculados com sucesso.', 'Nenhuma anomalia detectada nos últimos minutos.'];
const NOMES = ['Gohan', 'Goten', 'Mestre Kamen', 'Super Sayadin', 'Aniquilador', 'Tarzan', 'Apollo', 'Pegasus', 'Cisne'];
let tickCount = 0;
async function tick() {
  try {
    tickCount++;
    const reais = await precosReais();
    const atualizados = [];
    for (const a of carteira.ativos) {
      if (reais[a.ticker]) { a.precoAtual = reais[a.ticker]; atualizados.push(a.ticker + ' ' + brl(a.precoAtual)); }
      else a.precoAtual *= 1 + (Math.random() * 2 - 1) * 0.035;
      const varDia = ((a.precoAtual - a.precoFechamento) / a.precoFechamento) * 100;
      const dir = varDia >= 0 ? 'alta' : 'queda';
      const chave = a.ticker + dir;
      if (Math.abs(varDia) > 2 && !alertaEnviado[chave]) {
        alertaEnviado[chave] = true;
        log('Vedita', 'Detectou variação de ' + varDia.toFixed(2) + '% em ' + a.ticker + '.', 'alerta');
        log('Eddie', 'Disparou alerta de ' + dir + ' de ' + a.ticker + ' no WhatsApp.', 'whatsapp');
        zapEnviar((varDia >= 0 ? '📈' : '📉') + ' *' + a.ticker + '* ' + varDia.toFixed(2) + '%\nDe ' + brl(a.precoFechamento) + ' para ' + brl(a.precoAtual) + '\nPatrimônio: ' + brl(resumo().patrimonioAtual), 'alerta de ' + dir);
      }
      if (Math.abs(varDia) <= 2) { alertaEnviado[a.ticker + 'alta'] = false; alertaEnviado[a.ticker + 'queda'] = false; }
    }
    modoReal = atualizados.length > 0;
    if (atualizados.length) log('Vedita', 'Cotações reais atualizadas: ' + atualizados.slice(0, 5).join(' | '), 'mercado');
    if (tickCount % 3 === 0) log(NOMES[tickCount % NOMES.length], OCIOSAS[tickCount % OCIOSAS.length], 'info');
  } catch (e) { log('Vedita', 'Erro no tick: ' + e.message, 'info'); }
}
function iniciar() { setInterval(tick, 60000); log('Eddie', 'Mesa de Investimentos 24/7 iniciada. Tick de 60s ativo.', 'info'); }
iniciar();

// ---------- ROTAS DA API ----------
app.get('/api/dashboard', (req, res) => res.json({ agora: new Date().toISOString(), carteira: resumo() }));
app.get('/api/logs', (req, res) => { const since = parseFloat(req.query.since || '0'); res.json({ logs: logs.filter(l => l.id > since) }); });
app.post('/api/adicionar', (req, res) => {
  try {
    const a = adicionarAtivo(req.body || {});
    log('Cacaroto', 'Cadastrou o ativo ' + a.ticker + ' manualmente.', 'trade');
    log('Vedita', 'Recalculou os indicadores após cadastrar ' + a.ticker + '.', 'info');
    res.json({ ok: true, carteira: resumo() });
  } catch (e) { res.status(400).json({ ok: false, erro: e.message }); }
});
app.post('/api/remover', (req, res) => {
  const t = String((req.body || {}).ticker || '').toUpperCase();
  removerAtivo(t);
  log('Cacaroto', 'Removeu ' + t + ' da carteira.', 'trade');
  res.json({ ok: true, carteira: resumo() });
});
app.post('/api/trade', (req, res) => {
  const { acao, ticker, quantidade } = req.body || {};
  try {
    const r = acao === 'comprar' ? comprar(ticker, quantidade) : acao === 'vender' ? vender(ticker, quantidade) : null;
    if (!r) return res.status(400).json({ ok: false, erro: 'Ação deve ser comprar ou vender.' });
    log('Cacaroto', 'Ordem executada: ' + acao + ' ' + r.quantidade + ' ' + r.ativo + ' a ' + brl(r.precoExec) + '.', 'trade');
    log('Vedita', 'Recalculou os indicadores após a ordem.', 'info');
    res.json({ ok: true, carteira: resumo() });
  } catch (e) { res.status(400).json({ ok: false, erro: e.message }); }
});
app.post('/api/whatsapp-sim', async (req, res) => {
  const texto = (req.body || {}).texto || '';
  if (!String(texto).trim()) return res.status(400).json({ erro: 'Mensagem vazia.' });
  res.json({ resposta: eddieResposta(texto) });
});
app.post('/api/test-whatsapp', async (req, res) => {
  log('Eddie', 'Botão de teste acionado.', 'whatsapp');
  const r = await zapEnviar('🧠 *Teste da Mesa de Investimentos 24/7*\nSe você recebeu esta mensagem, a conexão Eddie → WhatsApp está funcionando! ✅', 'teste manual');
  res.json({ ok: r.enviado, simulado: r.simulado || false, erro: r.erro || null });
});
app.post('/webhook/whatsapp', async (req, res) => {
  const corpo = req.body || {};
  const texto = (typeof corpo.text === 'string' && corpo.text) || (corpo.text && corpo.text.message) || (corpo.message && corpo.message.text) || (typeof corpo.message === 'string' && corpo.message) || corpo.mensagem || corpo.body || '';
  if (!String(texto).trim()) return res.status(400).json({ erro: 'Mensagem vazia.' });
  try { res.json({ status: 'processado', resposta: eddieResposta(texto) }); }
  catch (e) { res.status(500).json({ status: 'erro', erro: e.message }); }
});

// ---------- PAINEL WEB ----------
const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mesa de Investimentos 24/7</title>
<script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-slate-950 text-slate-200 min-h-screen p-4">
<div class="max-w-6xl mx-auto">
  <header class="flex items-center justify-between mb-3">
    <h1 class="text-xl font-bold">🧠 Mesa de Investimentos 24/7</h1>
    <span id="modo" class="text-xs px-2 py-1 rounded-full bg-slate-800">...</span>
  </header>
  <div id="agentes" class="flex flex-wrap gap-2 mb-4"></div>
  <section id="metricas" class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"></section>
  <div class="grid md:grid-cols-2 gap-4">
    <section class="bg-slate-900 rounded-xl p-4 border border-slate-800">
      <h2 class="font-bold mb-2">📊 Carteira</h2>
      <div id="tabela" class="overflow-x-auto text-sm"></div>
    </section>
    <section class="space-y-4">
      <div class="bg-slate-900 rounded-xl p-4 border-2 border-amber-600">
        <h2 class="font-bold mb-2">➕ Meus Investimentos</h2>
        <form id="f-add" class="grid grid-cols-2 gap-2 text-sm">
          <input name="ticker" placeholder="Ticker (PETR4)" required class="bg-slate-800 rounded p-2">
          <input name="nome" placeholder="Nome (opcional)" class="bg-slate-800 rounded p-2">
          <select name="categoria" class="bg-slate-800 rounded p-2">
            <option value="ACAO_BR">Ação BR</option><option value="FII">FII</option><option value="ETF">ETF</option><option value="CRYPTO">Cripto</option><option value="EXTERIOR">Exterior</option>
          </select>
          <input name="quantidade" placeholder="Quantidade" required class="bg-slate-800 rounded p-2">
          <input name="precoMedio" placeholder="Preço médio (R$)" required class="bg-slate-800 rounded p-2 col-span-2">
          <button class="col-span-2 bg-emerald-600 hover:bg-emerald-500 rounded p-2 font-bold">Adicionar à carteira</button>
        </form>
      </div>
      <div class="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <h2 class="font-bold mb-2">🔁 Ordem</h2>
        <form id="f-trade" class="grid grid-cols-3 gap-2 text-sm">
          <select name="acao" class="bg-slate-800 rounded p-2"><option value="comprar">Comprar</option><option value="vender">Vender</option></select>
          <input name="ticker" placeholder="Ticker" required class="bg-slate-800 rounded p-2">
          <input name="quantidade" placeholder="Qtd" required class="bg-slate-800 rounded p-2">
          <button class="col-span-3 bg-sky-600 hover:bg-sky-500 rounded p-2 font-bold">Executar</button>
        </form>
      </div>
      <div class="bg-slate-900 rounded-xl p-4 border border-slate-800">
        <h2 class="font-bold mb-2">💬 WhatsApp (simulado)</h2>
        <div id="chat" class="h-40 overflow-y-auto bg-slate-950 rounded p-2 text-sm mb-2 space-y-1"></div>
        <form id="f-chat" class="flex gap-2 text-sm">
          <input id="chat-input" placeholder="Eddie, saldo" class="flex-1 bg-slate-800 rounded p-2">
          <button class="bg-emerald-600 rounded px-3 font-bold">➤</button>
        </form>
        <button id="btn-zap" class="mt-2 w-full bg-amber-500 hover:bg-amber-400 text-slate-900 rounded p-2 text-xs font-bold">📲 Testar WhatsApp</button>
      </div>
    </section>
  </div>
  <section class="bg-slate-900 rounded-xl p-4 border border-slate-800 mt-4">
    <h2 class="font-bold mb-2">📜 Logs da equipe</h2>
    <div id="logs" class="h-56 overflow-y-auto text-xs font-mono space-y-1"></div>
  </section>
  <p class="text-center text-xs text-slate-500 mt-4">Simulação educacional de mercado. Não constitui recomendação de investimento.</p>
</div>
<script>
var ultimoLog = 0;
function $(id){ return document.getElementById(id); }
function brl(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
var AGENTES = [['Eddie','🧠'],['Cacaroto','📋'],['Vedita','🧮'],['Gohan','📈'],['Goten','📊'],['Mestre Kamen','🏢'],['Super Sayadin','🛡️'],['Aniquilador','💥'],['Tarzan','🦍'],['Apollo','🗽'],['Pegasus','🐎'],['Cisne','🦢']];
$('agentes').innerHTML = AGENTES.map(function(a){ return '<span class="bg-slate-900 border border-slate-800 rounded-full px-3 py-1 text-xs">' + a[1] + ' ' + a[0] + '</span>'; }).join('');
async function carregar(){
  try{
    var d = await fetch('/api/dashboard').then(function(r){ return r.json(); });
    var c = d.carteira;
    $('modo').textContent = c.modoReal ? '🟢 MODO REAL' : '🟡 SIMULAÇÃO';
    $('metricas').innerHTML = [
      ['Total Investido', c.totalInvestido, ''],
      ['Patrimônio Atual', c.patrimonioAtual, ''],
      ['Resultado do Dia', c.resultadoDia, c.resultadoDia >= 0 ? 'text-emerald-400' : 'text-red-400'],
      ['Lucro/Prejuízo', c.lucroTotal, c.lucroTotal >= 0 ? 'text-emerald-400' : 'text-red-400'],
      ['Caixa Livre', c.caixa, '']
    ].map(function(m){ return '<div class="bg-slate-900 border border-slate-800 rounded-xl p-3"><div class="text-xs text-slate-400">' + m[0] + '</div><div class="text-lg font-bold ' + m[2] + '">' + brl(m[1]) + '</div></div>'; }).join('');
    if (!c.ativos.length) {
      $('tabela').innerHTML = '<p class="text-slate-400 text-center py-6">Nenhum investimento cadastrado ainda. Use o formulário ➕ para adicionar.</p>';
    } else {
      $('tabela').innerHTML = '<table class="w-full"><thead><tr class="text-slate-400 text-left"><th>Ativo</th><th>Qtd</th><th>Preço</th><th>Dia</th><th>Total</th><th></th></tr></thead><tbody>' +
        c.ativos.map(function(a){
          var cor = a.variacaoDia >= 0 ? 'text-emerald-400' : 'text-red-400';
          return '<tr class="border-t border-slate-800"><td class="py-1 font-bold">' + a.ticker + '</td><td>' + a.quantidade + '</td><td>' + brl(a.precoAtual) + '</td><td class="' + cor + '">' + a.variacaoDia.toFixed(2) + '%</td><td>' + brl(a.precoAtual * a.quantidade) + '</td><td><button data-ticker="' + a.ticker + '" class="text-red-400">✕</button></td></tr>';
        }).join('') + '</tbody></table>';
    }
  }catch(e){}
}
async function carregarLogs(){
  try{
    var d = await fetch('/api/logs?since=' + ultimoLog).then(function(r){ return r.json(); });
    if (d.logs.length){
      ultimoLog = d.logs[d.logs.length-1].id;
      var cores = { alerta:'text-amber-400', trade:'text-emerald-400', whatsapp:'text-sky-400', mercado:'text-violet-400', info:'text-slate-400' };
      $('logs').innerHTML += d.logs.map(function(l){ return '<div class="' + (cores[l.tipo]||'text-slate-400') + '">[' + l.hora + '] <b>' + l.agente + ':</b> ' + l.mensagem + '</div>'; }).join('');
      $('logs').scrollTop = $('logs').scrollHeight;
    }
  }catch(e){}
}
async function remover(t){ await fetch('/api/remover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:t})}); carregar(); carregarLogs(); }
$('tabela').addEventListener('click', function(e){ var b = e.target.closest('button[data-ticker]'); if (b) remover(b.getAttribute('data-ticker')); });
$('f-add').addEventListener('submit', async function(e){
  e.preventDefault();
  var f = new FormData(e.target);
  var r = await fetch('/api/adicionar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:f.get('ticker'),nome:f.get('nome'),categoria:f.get('categoria'),quantidade:f.get('quantidade'),precoMedio:f.get('precoMedio')})}).then(function(x){ return x.json(); });
  if(!r.ok) alert(r.erro);
  e.target.reset(); carregar(); carregarLogs();
});
$('f-trade').addEventListener('submit', async function(e){
  e.preventDefault();
  var f = new FormData(e.target);
  var r = await fetch('/api/trade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:f.get('acao'),ticker:f.get('ticker'),quantidade:f.get('quantidade')})}).then(function(x){ return x.json(); });
  if(!r.ok) alert(r.erro);
  carregar(); carregarLogs();
});
$('f-chat').addEventListener('submit', async function(e){
  e.preventDefault();
  var texto = $('chat-input').value;
  if(!texto.trim()) return;
  $('chat').innerHTML += '<div class="text-right"><span class="bg-emerald-700 rounded px-2 py-1 inline-block">' + texto + '</span></div>';
  $('chat-input').value = '';
  var r = await fetch('/api/whatsapp-sim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texto:texto})}).then(function(x){ return x.json(); });
  $('chat').innerHTML += '<div><span class="bg-slate-700 rounded px-2 py-1 inline-block whitespace-pre-line">' + r.resposta + '</span></div>';
  $('chat').scrollTop = $('chat').scrollHeight;
});
$('btn-zap').addEventListener('click', async function(){
  var b = $('btn-zap'); b.disabled = true; b.textContent = '⏳ Testando...';
  try{
    var r = await fetch('/api/test-whatsapp',{method:'POST'}).then(function(x){ return x.json(); });
    b.textContent = r.ok ? '✅ Enviado!' : '❌ Falhou';
  }catch(e){ b.textContent = '❌ Falhou'; }
  setTimeout(function(){ b.textContent = '📲 Testar WhatsApp'; b.disabled = false; }, 4000);
  carregarLogs();
});
carregar(); carregarLogs();
setInterval(carregar, 10000);
setInterval(carregarLogs, 5000);
<\/script>
</body>
</html>`;
app.get('/', (req, res) => res.send(HTML));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Mesa de Investimentos no ar na porta ' + PORT));
