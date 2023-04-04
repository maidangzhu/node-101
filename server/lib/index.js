const url = require('url')
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')
const mime = require('mime')

const { getList } = require('./model/todolist')
const param = require('./aspect/params')
const { Server, Router } = require('./interceptor')

const dbFile = path.resolve(__dirname, '../../database/todolist.db')
let db = null

const app = new Server()
const router = new Router()

app.use(async ({ req }, next) => {
  console.log(`${req.method} ${req.url}`)
  await next()
})

app.use(async (ctx, next) => {
  if (!db) {
    db = await open({
      filename: dbFile,
      driver: sqlite3.cached.Database
    })
  }
  ctx.database = db

  await next()
})

app.use(param)

app.use(router.post('/add', async ({ database, params, res }, next) => {
  res.setHeader('Content-Type', 'application/json')
  const { addTask } = require('./model/todolist')
  res.body = await addTask(database, params)
  await next()
}))

app.use(router.get('/list', async ({ database, route, res }, next) => {
  res.setHeader('Content-Type', 'application/json')
  const result = await getList(database) // 获取任务数据
  res.body = { data: result }
  await next()
}))

app.use(router.get('.*', async ({ req, res }, next) => {
  let filePath = path.resolve(__dirname, path.join('../../www', url.fileURLToPath(`file:///${req.url}`)))
  console.log('filePath', filePath)

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath)
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    if (fs.existsSync(filePath)) {
      const { ext } = path.parse(filePath)
      const stats = fs.statSync(filePath)
      const timeStamp = req.headers['if-modified-since']
      res.statusCode = 200
      if (timeStamp && Number(timeStamp) === stats.mtimeMs) {
        res.statusCode = 304
      }
      const mimeType = mime.getType(ext)
      res.setHeader('Content-Type', mimeType)
      res.setHeader('Cache-Control', 'max-age=86400')
      res.setHeader('Last-Modified', stats.mtimeMs)
      const acceptEncoding = req.headers['accept-encoding']
      const compress = acceptEncoding && /^(text|application)\//.test(mimeType)
      let compressionEncoding
      if (compress) {
        acceptEncoding.split(/\s*,\s*/).some((encoding) => {
          if (encoding === 'gzip') {
            res.setHeader('Content-Encoding', 'gzip')
            compressionEncoding = encoding
            return true
          }
          if (encoding === 'deflate') {
            res.setHeader('Content-Encoding', 'deflate')
            compressionEncoding = encoding
            return true
          }
          if (encoding === 'br') {
            res.setHeader('Content-Encoding', 'br')
            compressionEncoding = encoding
            return true
          }
          return false
        })
      }
      if (res.statusCode === 200) {
        const fileStream = fs.createReadStream(filePath)
        if (compress && compressionEncoding) {
          let comp
          if (compressionEncoding === 'gzip') {
            comp = zlib.createGzip()
          } else if (compressionEncoding === 'deflate') {
            comp = zlib.createDeflate()
          } else {
            comp = zlib.createBrotliCompress()
          }
          res.body = fileStream.pipe(comp)
        } else {
          res.body = fileStream
        }
      }
    }
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.body = '<h1>Not Found lalala</h1>'
    res.statusCode = 404
  }

  await next()
}))

app.listen({
  port: 9091,
  host: '127.0.0.1'
})