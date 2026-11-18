// Migração 0104: novo visual do site/app da igreja (pedido do Pedro, 2026-11-17).
//
// - site_settings.hero_image: foto do topo da página inicial (ex.: o templo num culto).
// - site_pages.cover: foto de capa da página (Quem somos, Ministérios...).
// - site_pages.images: fotos usadas dentro da página (até 40, 5 MB cada).
// - site_pages.blocks: a página montada em blocos (texto, título, foto, galeria, vídeo do
//   YouTube, botão e pessoa). Cada bloco de foto guarda só o nome do arquivo de "images";
//   a rota pública (site_public.js) monta o endereço. Página sem blocos continua usando "body".
//
// Tudo aqui é público (aparece no site). As regras de quem grava não mudam (admin.site.alterar).

const IMG = ['image/jpeg', 'image/png', 'image/webp']

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('site_settings')
    if (!settings.fields.getByName('hero_image')) {
      settings.fields.add(
        new FileField({
          name: 'hero_image',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: IMG,
        }),
      )
      app.save(settings)
    }
    const pages = app.findCollectionByNameOrId('site_pages')
    let changed = false
    if (!pages.fields.getByName('cover')) {
      pages.fields.add(
        new FileField({
          name: 'cover',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: IMG,
        }),
      )
      changed = true
    }
    if (!pages.fields.getByName('images')) {
      pages.fields.add(
        new FileField({
          name: 'images',
          maxSelect: 40,
          maxSize: 5242880,
          mimeTypes: IMG,
        }),
      )
      changed = true
    }
    if (!pages.fields.getByName('blocks')) {
      pages.fields.add(new JSONField({ name: 'blocks', maxSize: 100000 }))
      changed = true
    }
    if (changed) app.save(pages)
  },
  (app) => {
    try {
      const settings = app.findCollectionByNameOrId('site_settings')
      if (settings.fields.getByName('hero_image')) {
        settings.fields.removeByName('hero_image')
        app.save(settings)
      }
    } catch (_) {}
    try {
      const pages = app.findCollectionByNameOrId('site_pages')
      for (const f of ['cover', 'images', 'blocks']) {
        if (pages.fields.getByName(f)) pages.fields.removeByName(f)
      }
      app.save(pages)
    } catch (_) {}
  },
)
