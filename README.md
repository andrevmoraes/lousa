# Lousa

Aplicação React com Vite para organizar ideias em uma lousa visual.

## Desenvolvimento local

```bash
npm ci
npm run dev
```

## Deploy na Vercel

O projeto já inclui [vercel.json](./vercel.json) com as configurações de instalação, build e saída esperadas pela Vercel.

### Pelo dashboard

1. Importe o repositório na Vercel.
2. Mantenha a raiz do projeto como diretório raiz.
3. A Vercel detectará o framework Vite e usará `npm ci` seguido de `npm run build`.
4. O conteúdo publicado será gerado em `dist`.

### Pela CLI

```bash
npm install --global vercel
vercel
```

Para publicar em produção:

```bash
vercel --prod
```

Não são necessárias variáveis de ambiente para a versão atual. Os dados da lousa são armazenados no `localStorage` do navegador.
