import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';

test('rifas SSR usan transporte interno sin cambiar contrato, datos ni tratamiento de errores', async () => {
  const source=readFileSync(new URL('../src/lib/raffles.ts',import.meta.url),'utf8');
  const result=await build({
    stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../src/lib/',import.meta.url))},
    bundle:true,write:false,platform:'node',format:'esm',
    define:{'import.meta.env':JSON.stringify({PUBLIC_POCKETBASE_URL:'https://public.example'})},
    plugins:[{name:'isolate-unused-db-client',setup(build){
      build.onResolve({filter:/^\.\/pocketbase$/},()=>({path:'pocketbase',namespace:'test'}));
      build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const pb={}; export const getPocketBaseFileUrl=()=>"https://media.example/image.webp";'}));
    }}],
  });
  const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const originalFetch=globalThis.fetch;
  const originalInternal=process.env.PZ_POCKETBASE_INTERNAL_URL;
  const originalPublic=process.env.PUBLIC_POCKETBASE_URL;
  const requests=[];
  const raffle={id:'raffle1',slug:'rifa-1',status:'active'};
  let response=()=>new Response(JSON.stringify({ok:true,raffles:[raffle],raffle,occupied_numbers:['01','99','invalid']}),{status:200});
  globalThis.fetch=async (url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});return response();};
  try {
    process.env.PZ_POCKETBASE_INTERNAL_URL='http://pocketbase-internal:8080/';
    process.env.PUBLIC_POCKETBASE_URL='https://public.example';
    assert.deepEqual(await api.getVisibleRafflesForStore('PowerZona'),[raffle]);
    assert.deepEqual(await api.getVisibleRaffleBySlug('powerzona','rifa-1'),raffle);
    assert.deepEqual(await api.getFirstVisibleRaffle('powerzona'),raffle);
    const detail=await api.getPublicRafflePageData('powerzona','rifa-1');
    assert.deepEqual(detail,{raffle,occupiedNumbers:['01','99']});
    assert.deepEqual(requests.map(r=>r.body.action),['home','detail','first','detail']);
    for(const request of requests){
      assert.equal(request.url,'http://pocketbase-internal:8080/api/pz/raffles/public');
      assert.equal(request.options.method,'POST');
      assert.equal(request.options.cache,'no-store');
      assert.deepEqual(request.options.headers,{'Content-Type':'application/json'});
      assert.equal(request.body.store_slug,'powerzona');
    }
    assert.equal(await api.getVisibleRaffleBySlug('powerzona','invalid'),null);
    assert.deepEqual(await api.getVisibleRafflesForStore(''),[]);
    assert.equal(requests.length,4);
    process.env.PZ_POCKETBASE_INTERNAL_URL='';
    await api.getVisibleRafflesForStore('powerzona');
    assert.equal(requests.at(-1).url,'https://public.example/api/pz/raffles/public');
    process.env.PZ_POCKETBASE_INTERNAL_URL='invalid';
    const beforeInvalid=requests.length;
    assert.deepEqual(await api.getVisibleRafflesForStore('powerzona'),[]);
    assert.equal(requests.length,beforeInvalid);
    process.env.PZ_POCKETBASE_INTERNAL_URL='http://pocketbase-internal:8080';
    for(const factory of [
      ()=>new Response('{"ok":false}',{status:403}),
      ()=>new Response('not json',{status:200}),
      ()=>{throw new Error('backend unavailable');},
    ]){
      response=factory;
      assert.deepEqual(await api.getVisibleRafflesForStore('powerzona'),[]);
      assert.deepEqual(await api.getPublicRafflePageData('powerzona','rifa-1'),{raffle:null,occupiedNumbers:[]});
    }
  }finally{
    globalThis.fetch=originalFetch;
    if(originalInternal===undefined)delete process.env.PZ_POCKETBASE_INTERNAL_URL;else process.env.PZ_POCKETBASE_INTERNAL_URL=originalInternal;
    if(originalPublic===undefined)delete process.env.PUBLIC_POCKETBASE_URL;else process.env.PUBLIC_POCKETBASE_URL=originalPublic;
  }
});
