import Starlights from '@StarlightsTeam/Scraper'
import fetch from 'node-fetch'
import Sph from 'ytdl-mp3'

const limit = 200

let handler = async (m, { conn, args, text, isPrems, isOwner, usedPrefix, command }) => {
    if (!args[0]) {
        return m.reply('[ ✰ ] Ingresa el enlace del vídeo de *YouTube* junto al comando.\n\n`» Ejemplo :`\n' + `> *${usedPrefix + command}* https://youtu.be/QSvaCSt8ixs`)
    }

    await m.react('🕓')
    try {
        let { title, duration, size, thumbnail, dl_url } = await Starlights.ytmp3v2(args[0])
        
        if (parseFloat(size.split('MB')[0]) >= limit) {
            return m.reply(`El archivo pesa más de ${limit} MB, se canceló la descarga.`).then(() => m.react('✖️'))
        }

        let img = await (await fetch(thumbnail)).buffer()
        let txt = '`乂  Y O U T U B E  -  M P 3 D O C`\n\n' +
                  `	✩   *Título* : ${title}\n` +
                  `	✩   *Duración* : ${duration}\n` +
                  `	✩   *Tamaño* : ${size}\n\n` +
                  '> *- ↻ El audio se está enviando, espera un momento...*'
        
        await conn.sendMessage(m.chat, { image: img, caption: txt }, { quoted: m })
        await conn.sendMessage(m.chat, { document: { url: dl_url }, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m })
        await m.react('✅')
    } catch {
        try {
            let { title, size, quality, thumbnail, dl_url } = await Starlights.ytmp3(args[0])
            
            if (parseFloat(size.split('MB')[0]) >= limit) {
            return m.reply(`El archivo pesa más de ${limit} MB, se canceló la descarga.`).then(() => m.react('✖️'))
        }

            let img = await (await fetch(thumbnail)).buffer()
            let txt = '`乂  Y O U T U B E  -  M P 3 D O C`\n\n' +
                      `	✩   *Título* : ${title}\n` +
                      `	✩   *Calidad* : ${quality}\n` +
                      `	✩   *Tamaño* : ${size}\n\n` +
                      '> *- ↻ El audio se está enviando, espera un momento...*'
            
            await conn.sendFile(m.chat, img, 'thumbnail.jpg', txt, m)
            await conn.sendMessage(m.chat, { document: { url: dl_url }, mimetype: 'audio/mpeg', fileName: `${title}.mp3` }, { quoted: m })
            await m.react('✅')
        } catch {
            try {
                let cxf = await Sph.ytdl(args[0])
                let txt = '`乂  Y O U T U B E  -  M P 3 D O C`\n\n' +
                          `	✩   *Título* : ${cxf.title}\n` +
                          `	✩   *Calidad* : ${cxf.quality}\n` +
                          `	✩   *Url* : ${cxf.url}\n\n` +
                          '> *- ↻ El audio se está enviando, espera un momento...*'
                
                await conn.sendMessage(m.chat, { image: { url: cxf.thumbnail }, caption: txt }, { quoted: m })
                await conn.sendMessage(m.chat, { document: { url: cxf.dl_url }, mimetype: 'audio/mpeg', fileName: `${cxf.title}.mp3` }, { quoted: m })
                await m.react('✅')
            } catch {
                await m.react('✖️')
            }
        }
    }
}
handler.help = ['ytmp3doc *<link yt>*']
handler.tags = ['downloader']
handler.command = ['ytmp3doc', 'ytadoc']
handler.register = true

export default handler