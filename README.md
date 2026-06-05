<h1 align="center">Full Custom Media Bar</h1>
<h2 align="center">Um plugin para Jellyfin</h2>

<p align="center">
  Fork do <a href="https://github.com/IAmParadox27/jellyfin-plugin-media-bar">jellyfin-plugin-media-bar</a>
  (por sua vez baseado no <a href="https://github.com/MakD/Jellyfin-Media-Bar">Jellyfin-Media-Bar</a> do MakD),
  com uma <strong>barra de mídia 100% customizável</strong> — ideal para montar uma
  programação manual (ex.: jogos da Copa) com título, imagem, vídeo ou transmissão ao vivo.
</p>

---

## O que este fork adiciona

O plugin original popula a barra a partir da sua biblioteca do Jellyfin. Este fork
adiciona um **modo "Programação Custom"** em que **você** define cada item exibido,
sem que ele precise existir na biblioteca:

- **Título**, **subtítulo** e **descrição** livres
- **Imagem de fundo** (backdrop) por URL
- **Logo** opcional por URL (substitui o título por uma imagem)
- **Selo/Badge** (ex.: `AO VIVO`, `14:00`, `Hoje`)
- **Mídia** reproduzida ao clicar em *Assistir*, em um player embutido (overlay):
  - **Vídeo** (`.mp4`, `.webm`, ...) → `<video>` nativo
  - **Transmissão ao vivo**:
    - HLS (`.m3u8`) → via [hls.js](https://github.com/video-dev/hls.js) (player nativo no Safari)
    - MPEG-TS / FLV / streams `.ts` ao vivo → via [mpegts.js](https://github.com/xqq/mpegts.js)
  - **YouTube / YouTube Live** → iframe embutido (com fallback "abrir em nova aba")
  - **Link externo** → abre em uma nova aba

  > As bibliotecas `hls.js` e `mpegts.js` são **servidas pelo próprio plugin**
  > (sem CDN externo). Se a reprodução falhar, normalmente é **CORS**: o servidor
  > do stream precisa permitir o domínio do seu Jellyfin.

O modo é selecionável nas configurações: **Biblioteca** (comportamento original)
ou **Programação Custom**. O front-end customizado é servido pelo próprio plugin
(não depende de CDN externo).

## Pré-requisitos

- Jellyfin `10.11.x` (o `.csproj` também suporta `10.10.7` via `-p:JellyfinVersion=10.10.7`)
- Plugin **File Transformation** (https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) — `v2.2.1.0` ou superior

## Instalação pelo catálogo do Jellyfin (direto do GitHub)

A forma recomendada — instala e atualiza pelo painel do Jellyfin:

1. No **Actions** do GitHub, rode o workflow **"Release Plugin"** (botão *Run workflow*)
   ou faça push de uma tag `vX.Y.Z`. Ele cria um **Release** com o `.zip` e atualiza o
   `manifest.json` na branch `main`.
2. No Jellyfin: **Dashboard → Plugins → Repositories → +** e adicione a URL do manifesto:

   ```
   https://raw.githubusercontent.com/cleiton-tavares/jellyfin-plugin-full-custom-media-bar/main/manifest.json
   ```

3. **Dashboard → Plugins → Catalog**, encontre **Full Custom Media Bar** e clique em **Install**.
4. Reinicie o Jellyfin e faça *force refresh* da página inicial.

> Os releases são compilados para Jellyfin **10.11.x**. Se o seu servidor for outra
> sub-versão e o plugin não carregar, rode o workflow informando a versão exata em
> `jellyfinVersion` (ex.: `10.11.10`).

## Build manual

Não há repositório de plugins publicado para este fork; compile o DLL:

```bash
dotnet build src/Jellyfin.Plugin.MediaBar/Jellyfin.Plugin.MediaBar.csproj \
  -c Release -p:JellyfinVersion=10.11.2 -o ./publish
```

Copie `publish/Jellyfin.Plugin.MediaBar.dll` para uma pasta dentro do diretório
`plugins` do seu Jellyfin (ex.: `plugins/FullCustomMediaBar/`) e reinicie o servidor.

> O workflow do GitHub Actions (`.github/workflows/build.yml`) também compila e
> publica o `.dll` como artefato a cada push.

## Como usar a Programação Custom

1. **Dashboard → Plugins → Full Custom Media Bar.**
2. Aba **Programação Custom**:
   - Em **Modo de conteúdo**, selecione **Programação Custom (Copa)**.
   - Clique em **+ Adicionar item** para cada slide e preencha os campos.
   - Em **Tipo de mídia**, escolha como o botão *Assistir* deve reproduzir.
3. **Salve** e atualize a página inicial (force refresh: `Ctrl+Shift+R`).

### Exemplo de item

| Campo | Valor |
| --- | --- |
| Título | `Brasil x Argentina` |
| Subtítulo | `Final • Estádio Maracanã` |
| URL da imagem de fundo | `https://exemplo.com/brasil-argentina.jpg` |
| Selo/Badge | `AO VIVO` |
| Tipo de mídia | `Transmissão ao vivo (HLS .m3u8)` |
| URL da mídia | `https://exemplo.com/stream/index.m3u8` |
| Texto do botão | `Assistir ao vivo` |

## Solução de problemas

- **A barra não aparece:** confirme que o **File Transformation** está instalado e
  ativo, reinicie o Jellyfin e faça *force refresh* com o cache desabilitado
  (DevTools → Network → *Disable cache*).
- **O stream ao vivo não toca:** verifique se a URL `.m3u8` é acessível pelo
  navegador (CORS) e suporta reprodução por `hls.js`.

## Créditos

- [@MakD](https://github.com/MakD) — Jellyfin-Media-Bar original.
- [@IAmParadox27](https://github.com/IAmParadox27) — fork em plugin + integração com File Transformation.
- [@BobHasNoSoul](https://github.com/BobHasNoSoul), [@SethBacon](https://forum.jellyfin.org/u-sethbacon) e [@tedhinklater](https://github.com/tedhinklater) — trabalhos que inspiraram o original.

## Licença

Mantém a licença do projeto original (DBAD). Veja [LICENSE.md](LICENSE.md).
Modificações devem ser contribuídas de volta e a atribuição ao autor original (MakD) é exigida.
