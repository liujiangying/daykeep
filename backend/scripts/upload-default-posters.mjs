import { readFile } from 'node:fs/promises'
import COS from 'cos-nodejs-sdk-v5'

const required = ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION']
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`)
}

const bucket = process.env.COS_BUCKET
const region = process.env.COS_REGION
const publicHost =
  process.env.COS_PUBLIC_HOST || `${bucket}.cos.${region}.myqcloud.com`
const prefix = process.env.COS_PREFIX || 'daykeep'
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
})

const names = ['mist', 'field', 'rain', 'paper']
for (const name of names) {
  const key = `${prefix}/defaults/posters/${name}.jpg`
  const body = await readFile(
    new URL(`./assets/posters/default-${name}.jpg`, import.meta.url),
  )
  await new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: body,
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      },
      (error) => (error ? reject(error) : resolve()),
    )
  })
  console.log(`https://${publicHost}/${key}`)
}
