import {visibleNutrients,barcode,identity,normalize,amount,formatAmount,comparisonNote,validateConfig,productURL,csv,validateReceipt} from './model.mjs';
const $=id=>document.getElementById(id);
let config,records=[],examples=[],busy=false,requestTimes=[];
const cache=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function date(value){if(!value)return 'Not recorded';return new Intl.DateTimeFormat('en-CA',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value));}
function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function product(record){return normalize(record.raw,record.capturedAt,record.origin||'saved');}
function add(record){const p=product(record),key=identity(p.code);const existing=records.findIndex(r=>identity(product(r).code)===key);if(existing>=0)records[existing]=record;else{if(records.length>=config.maxProducts)throw new Error(`Your desk holds ${config.maxProducts} labels. Remove one to add another.`);records.push(record);}render();return p;}
function tagList(values,empty){const node=el('div',undefined,'tag-list');if(values.length)values.forEach(v=>node.append(el('span',v,'tag')));else node.append(el('span',empty,'unknown'));return node;}
function render(){
  const products=records.map(product),basis=$('basis').value;
  $('capacity').textContent=`${products.length} of ${config.maxProducts} comparison slots`;
  $('basis-note').textContent=products.length?comparisonNote(products,basis):'Add a barcode, choose a saved label, or open one of your receipts.';
  $('products').replaceChildren();
  if(!products.length)$('products').append(el('p','Your comparison desk is empty. Any food barcode supported by Open Food Facts can be added.','empty'));
  for(const p of products){
    const card=el('article',undefined,'product-card');card.dataset.barcode=p.code;
    const top=el('div',undefined,'card-top');top.append(el('span',p.origin==='live'?'Live lookup':p.origin==='imported'?'Imported receipt':'Saved label','origin'));
    const remove=el('button','Remove','remove');remove.setAttribute('aria-label',`Remove ${p.name}`);remove.onclick=()=>{records=records.filter(r=>identity(product(r).code)!==identity(p.code));render();message(`${p.name} removed.`);};top.append(remove);card.append(top);
    const intro=el('div',undefined,'product-intro');if(p.image){const img=el('img');img.className='product-image';img.src=p.image;img.alt=`${p.name} packaging, Open Food Facts contributors`;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();intro.append(img);}
    const title=el('div');title.append(el('p',p.brand||'Brand not recorded','brand'),el('h3',p.name),el('span',p.code,'code'));intro.append(title);card.append(intro);
    const dl=el('dl');for(const [label,value] of [['Package',p.quantity||'Not reported'],['Serving',p.serving||'Not reported'],['Nutrition basis',p.basisUnit?`100 ${p.basisUnit}`:'100 g/mL · unit unknown'],['Markets reported',p.countries.join(', ')||'Not reported']]){const cell=el('div');cell.append(el('dt',label),el('dd',value));dl.append(cell);}card.append(dl);
    card.append(el('h4','Ingredients'),el('p',p.ingredients||'Ingredient list not reported.','ingredients'+(!p.ingredients?' unknown':'')),el('h4','Reported allergens'),tagList(p.allergens,'No allergen data listed'),el('h4','Reported traces'),tagList(p.traces,'No trace data listed'));
    const details=el('details',undefined,'label-details');details.append(el('summary','More label details & photos'));
    const extra=el('dl');for(const [label,value] of [['Categories',p.categories],['Label claims',p.labels],['Ingredient origins',p.origins],['Manufacturing places',p.manufacturing],['Stores reported',p.stores],['Packaging',p.packaging]]){const cell=el('div');cell.append(el('dt',label),el('dd',value||'Not reported',value?'':'unknown'));extra.append(cell);}details.append(extra);
    const photos=el('div',undefined,'photo-links');p.photos.forEach(photo=>photos.append(link(photo.label,photo.url)));if(!p.photos.length)photos.append(el('span','No label photos in this record.','unknown'));details.append(el('h4','Source photographs'),photos,el('p','Open the original label photos to check the transcription. Claims, origins and store listings are contributor records, not independent verification.','small-note'));card.append(details);
    const source=el('p',undefined,'source-line');source.append(el('span',`Retrieved ${date(p.capturedAt)} · Edited ${date(p.updatedAt)}`),link('Read source label',p.source));card.append(source);
    const refresh=el('button','Look up current record','refresh');refresh.disabled=busy;refresh.onclick=()=>lookup(p.code,true);card.append(refresh);$('products').append(card);
  }
  const head=el('tr');head.append(el('th','Nutrient'));products.forEach(p=>{const th=el('th',p.name);th.scope='col';th.append(el('small',basis==='serving'?(p.serving||'Serving size missing'):`Per 100 ${p.basisUnit||'g/mL · unit unknown'}`));head.append(th);});$('nutrition-head').replaceChildren(head);$('nutrition-body').replaceChildren();
  visibleNutrients(products).forEach(n=>{const row=el('tr');const label=el('th',n.name+' ('+n.unit+')');label.scope='row';row.append(label);products.forEach(p=>{const value=amount(p,n,basis);const qualifier=value!==null?p.nutrients[n.id].modifier:'';const cell=el('td',qualifier+formatAmount(value),value===null?'missing':undefined);row.append(cell);});$('nutrition-body').append(row);});
  $('export-json').disabled=!records.length;$('export-csv').disabled=!records.length;$('add-product').disabled=busy;$('clear').disabled=busy;
}
async function lookup(value,refresh=false){
  if(busy)return;
  try{
    const code=barcode(value),key=identity(code);const exists=records.some(r=>identity(product(r).code)===key);
    if(!exists&&records.length>=config.maxProducts)throw new Error(`Your desk holds ${config.maxProducts} labels. Remove one to add another.`);
    if(!refresh&&cache.has(key)){const p=add(cache.get(key));message(`${p.name} added from this tab’s lookup cache.`);return;}
    const now=Date.now();requestTimes=requestTimes.filter(t=>now-t<60000);
    if(requestTimes.length>=config.requestsPerMinute)throw new Error('The request budget for this minute is used. Wait a minute before another lookup.');
    const wait=config.requestIntervalMs-(now-(requestTimes.at(-1)||0));
    if(wait>0)throw new Error(`Please wait ${Math.ceil(wait/1000)} seconds before another lookup.`);
    busy=true;render();message(`Looking up ${code} in Open Food Facts…`);requestTimes.push(now);
    const response=await fetch(productURL(code),{signal:AbortSignal.timeout(25000),credentials:'omit'});
    if(response.status===404)throw new Error('This barcode is not in Open Food Facts. Check the digits or contribute the label on its website.');
    if(response.status===429)throw new Error('Open Food Facts is rate limiting requests. Wait a minute before trying again. Your current comparison is preserved.');
    if(!response.ok)throw new Error(`Open Food Facts is unavailable (HTTP ${response.status}). Your current comparison is preserved; try again later.`);
    const raw=await response.json(),record={raw,capturedAt:new Date().toISOString(),origin:'live'};
    const p=normalize(raw,record.capturedAt,'live');if(identity(p.code)!==key)throw new Error('The provider returned a different barcode; the record was not added.');
    add(record);cache.set(key,record);$('barcode').value='';message(`${p.name} added. Source records can differ from the package in your hand.`);
  }catch(error){message(error.name==='TimeoutError'?'The lookup timed out. Your current comparison is preserved.':error.message==='Failed to fetch'?'The lookup could not connect. Use a saved label or receipt, or try again later.':error.message,true);}
  finally{busy=false;render();}
}
async function main(){
  const response=await fetch('./config.json');if(!response.ok)throw new Error('Configuration could not be loaded.');config=validateConfig(await response.json());
  const saved=await fetch('./data/examples.json');if(!saved.ok)throw new Error('Saved labels could not be loaded.');const data=await saved.json();
  examples=validateReceipt(data,1000).map(r=>({...r,origin:'saved'}));
  for(const code of config.exampleBarcodes){const record=examples.find(r=>identity(product(r).code)===identity(code));const b=el('button',record?product(record).name:code);b.type='button';b.dataset.example=code;b.onclick=()=>{try{if(record){const p=add(record);message(`${p.name} added from the dated saved labels.`);}else lookup(code);}catch(e){message(e.message,true);}};$('examples').append(b);}
  for(const code of config.initialBarcodes){const record=examples.find(r=>identity(product(r).code)===identity(code));if(record)add(record);}
  $('examples-date').textContent=`Saved ${date(data.capturedAt)}`;render();message(`${records.length} saved labels loaded. Enter any barcode to make your own comparison.`);
  $('lookup-form').onsubmit=e=>{e.preventDefault();lookup($('barcode').value);};$('basis').onchange=render;
  $('clear').onclick=()=>{records=[];render();message('Label desk cleared. Receipt history below is separate and unchanged.');};
  $('export-json').onclick=()=>download('labelcompare-receipt.json',JSON.stringify({schemaVersion:1,tool:'labelcompare',exportedAt:new Date().toISOString(),basis:$('basis').value,attribution:'Open Food Facts contributors',dataLicense:'https://opendatacommons.org/licenses/odbl/1-0/',records:records.map(({raw,capturedAt})=>({raw,capturedAt}))},null,2),'application/json');
  $('export-csv').onclick=()=>download('labelcompare-nutrition.csv',csv(records.map(product),$('basis').value),'text/csv;charset=utf-8');
  $('import-json').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw new Error('Receipt exceeds the 10 MB import limit.');const data=JSON.parse(await file.text());const imported=validateReceipt(data,config.maxProducts);records=imported.map(r=>({raw:r.raw,capturedAt:r.capturedAt,origin:'imported'}));if(['per100','serving'].includes(data.basis))$('basis').value=data.basis;render();message(`${records.length} receipt labels opened locally.`);}catch(err){message(err.message,true);}finally{e.target.value='';}};
}
main().catch(e=>{message(e.message,true);$('add-product').disabled=true;});
