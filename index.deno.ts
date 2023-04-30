import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import "https://deno.land/x/lodash@4.17.19/dist/lodash.js";

// now `_` is imported in the global variable, which in deno is `self`
const _ = (self as any)._;

const SHEET_ID = Deno.env.get('SHEET_ID')
const SHEET_NAME = Deno.env.get('SHEET_NAME')
const GOOGLE_SHEET_TOKEN = Deno.env.get('GOOGLE_SHEET_TOKEN')

interface Shortlink {
  shortcut: string;
  url: string;
  response_code: number;
  notes: string;
}

const getSheetData = async (url:string)   => {
  const response = await fetch(url)
  const sheet = await response.json()
  const rows: [[string]] = sheet.values
  const headers = rows[0]
  const values = rows.slice(1, -1)
  const output = values.map(v => {
    return _.zipObject(headers, v) as Shortlink
  })
  console.log({output})
  return output
}

const CACHE_KEY = ['DATA', 'GOOGLE_SHEET_DATA']
const CACHE_KEY_EXPIRES_AT = ['DATA', 'GOOGLE_SHEET_EXPIRES_AT']
const TTL_MILLIS = 30 * 60 * 1000

const handler = async (req: Request) => {
  const {url} = req
  const d = new URL(url)
  const path = _.trimStart(d.pathname, '/')
  console.log({path})

  const kv = await Deno.openKv();
  const ttlResult: Deno.KvEntryMaybe<unknown> = await kv.get(CACHE_KEY_EXPIRES_AT)
  const now = (new Date()).getTime()
  if(ttlResult?.value < now) {
    await kv.delete(CACHE_KEY_EXPIRES_AT)
    await kv.delete(CACHE_KEY)
  }
  const result = await kv.get(CACHE_KEY)
  let data: Shortlink[] = []
  if(result.value) {
    data = result.value as Shortlink[]
  } else {
    data = await getSheetData(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A1:D100000?key=${GOOGLE_SHEET_TOKEN}`)
    await kv.atomic()
      .set(CACHE_KEY, data)
      .set(CACHE_KEY_EXPIRES_AT, now + TTL_MILLIS)
      .commit()
  }


  // TODO: set headers indicating whether it was a cache hit and when the cache expires
  const match = data.find(d => d.shortcut === path)
  console.log({match})
  if(match){
    const response_code = match.response_code || 302
    if(response_code >= 300 && response_code < 400) {
      let r = Response.redirect(match.url, response_code)
      //r.headers.set('x-cache-expires-at', )
      return r
    }
    return new Response("", {status: response_code, headers: {

    }})
  }
  return new Response("", {status: 404})
}

serve(handler);
