# Luma Dashboard

Luma Dashboard — extensão Firefox que substitui a nova aba por uma dashboard visual, rápida e elegante com boards, widgets, clima, calendário e notas.

## Stack

- **Vite** — build rápido e leve
- **TypeScript** — tipagem estática
- **Preact** — React-like com bundle muito menor
- **CSS puro organizado por feature**
- **WebExtensions Manifest V3**
- **browser.storage.local** — dados locais, sem backend

## Funcionalidades MVP

- Substitui a nova aba do Firefox (`chrome_url_overrides.newtab`)
- Boards visuais com cards de links
- Criar, renomear e excluir boards
- Cards com título, URL, favicon e nota opcional
- Popup com botão "Salvar aba atual"
- Busca instantânea de links
- Tema claro/escuro/sistema
- Wallpaper customizável (gradientes pré-definidos ou URL)
- Layout responsivo
- Dados de exemplo na primeira execução

## Estrutura do projeto

```
.
├── dist/                    # Build pronto para instalação
├── public/
│   ├── manifest.json        # Manifest V3 da extensão
│   └── icons/               # Ícones PNG gerados do SVG
├── scripts/
│   └── build-icons.js       # Gera ícones PNG a partir do SVG
├── src/
│   ├── newtab/
│   │   ├── App.tsx          # Página principal da nova aba
│   │   ├── main.tsx         # Entry point da nova aba
│   │   ├── styles.css       # Estilos da nova aba
│   │   └── components/      # Componentes da newtab
│   ├── popup/
│   │   ├── Popup.tsx        # Popup da extensão
│   │   ├── main.tsx         # Entry point do popup
│   │   └── styles.css       # Estilos do popup
│   └── shared/
│       ├── browser.ts       # Wrapper da API do navegador
│       ├── storage.ts       # Funções centralizadas de storage
│       └── types.ts         # Tipos e dados iniciais
├── newtab.html              # HTML da nova aba
├── popup.html               # HTML do popup
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Requisitos de sistema

- **OS**: Windows, macOS ou Linux
- **Node.js**: >= 18.x
- **npm**: >= 9.x

## Como rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Build de produção

```bash
npm run build
```

O comando gera os ícones PNG, compila o TypeScript e emite os arquivos na pasta `dist/`.

> Este build reproduz exatamente o pacote enviado. O zip da extensão é o conteúdo da pasta `dist/`.

### 3. Carregar no Firefox

1. Abra o Firefox e digite na barra de endereço: `about:debugging`
2. Clique em **"This Firefox"** (ou "Este Firefox")
3. Clique em **"Load Temporary Add-on..."** (ou "Carregar extensão temporária...")
4. Navegue até a pasta `dist/` e selecione o arquivo `manifest.json`

A extensão será carregada. Abra uma nova aba para ver a dashboard.

> **Dica:** A extensão fica carregada apenas durante a sessão atual do Firefox. Para usar permanentemente, é necessário empacotar e publicar na Mozilla Add-ons ou assinar com um arquivo `.xpi`.

### Desenvolvimento

```bash
npm run dev
```

O Vite inicia um servidor de desenvolvimento. Para testar a extensão no Firefox, ainda é necessário carregar a pasta `dist/` via `about:debugging` após o build.

## Decisões de performance

1. **Preact em vez de React**: reduz o bundle inicial em dezenas de KB mantendo a API familiar.
2. **CSS puro**: sem bibliotecas de CSS-in-JS ou frameworks de UI, evitando parse e runtime extras.
3. **WebExtension Polyfill apenas onde necessário**: centralizado em `src/shared/browser.ts`.
4. **Favicon leve**: usa serviço de favicon do Google com tamanho 64px, com fallback para o favicon nativo da aba no popup.
5. **Storage centralizado**: todas as operações de `browser.storage.local` passam por `src/shared/storage.ts`, com funções puras para atualizar o estado.
6. **Busca simples no cliente**: busca por substring em título, URL e nota, sem índices complexos para o MVP.
7. **CSS transitions**: microinterações via CSS puro, sem animações JavaScript pesadas.
8. **Imagens sob demanda**: wallpaper padrão são gradientes CSS; imagens externas só carregam quando o usuário escolhe.
9. **Bundle dividido**: newtab e popup são entry points separados, carregando apenas o necessário.
10. **Estado de UI separado do estado persistido**: o componente mantém o estado visual (busca, modais, aba ativa) e sincroniza o modelo de dados com `browser.storage.local`.

## Licença

MIT
