import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Deterministic sprite-sheet packing: preserve the generated artwork and alpha.
// Source images remain in the approved reference pack; no credentials are needed.
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(process.argv[2] ?? path.join(root, '../references/original-fighters-2026-10-15'));
const ids = ['emberpaw','cloudhop','stoneguard','scrapclaw','stormhorn','mossbite','pebblepop','puffvolt','cinderveil','tideknuckle'];
const groups = ['movement','combat','reactions'];
const alphaThreshold = 96;
const output = { version: 1, characters: {} };

function separators(density, count) {
  const edges = [0], length = density.length;
  for (let n = 1; n < count; n++) {
    const ideal = length * n / count, radius = length / count * 0.15;
    let best = Math.round(ideal), score = Infinity;
    for (let p = Math.round(ideal-radius); p <= ideal+radius; p++) {
      // A low-content corridor is safer than equal tiles when generated rows drift.
      let ink = 0;
      for (let d = -2; d <= 2; d++) ink += density[Math.max(0, Math.min(length-1,p+d))];
      const candidate = ink + Math.abs(p-ideal) * 0.01;
      if (candidate < score) { score = candidate; best = p; }
    }
    edges.push(best);
  }
  return [...edges,length];
}

function actorBounds(data, width, x0, y0, x1, y1) {
  const w=x1-x0,h=y1-y0,visited=new Uint8Array(w*h),stack=new Int32Array(w*h),components=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const start=y*w+x;
    if(visited[start] || data[((y+y0)*width+x+x0)*4+3]<alphaThreshold) continue;
    let size=1,area=0,left=x,right=x,top=y,bottom=y;
    stack[0]=start;visited[start]=1;
    while(size) {
      const p=stack[--size],px=p%w,py=Math.floor(p/w);area++;
      left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
      for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]]) {
        if(nx<0||nx>=w||ny<0||ny>=h) continue;
        const np=ny*w+nx;
        if(visited[np]||data[((ny+y0)*width+nx+x0)*4+3]<alphaThreshold) continue;
        visited[np]=1;stack[size++]=np;
      }
    }
    components.push({area,left,right,top,bottom});
  }
  components.sort((a,b)=>b.area-a.area);
  if(!components.length) throw new Error('Empty cell');
  const main=components[0],bounds={...main};
  // Ignore dust or tiny ear tips belonging to the next row; preserve substantial detached parts.
  for(const c of components.slice(1)) {
    if(c.area<main.area*0.035) continue;
    if(c.right<main.left-20||c.left>main.right+20||c.bottom<main.top-20||c.top>main.bottom+20) continue;
    bounds.left=Math.min(bounds.left,c.left);bounds.right=Math.max(bounds.right,c.right);
    bounds.top=Math.min(bounds.top,c.top);bounds.bottom=Math.max(bounds.bottom,c.bottom);
  }
  return {left:bounds.left+x0,right:bounds.right+x0,top:bounds.top+y0,bottom:bounds.bottom+y0};
}

for (const id of ids) {
  const dest = path.join(root,'public/fighters',id);
  await fs.mkdir(dest,{recursive:true});
  const character = { portraitUrl:`fighters/${id}/portrait.webp`, sheets:{} };
  for (const group of groups) {
    const file = path.join(source,id,`${group}.png`);
    const {data,info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const {width,height} = info;
    const rowInk = new Uint32Array(height);
    for (let y=0;y<height;y++) for(let x=0;x<width;x++) if(data[(y*width+x)*4+3]>=alphaThreshold) rowInk[y]++;
    const rows=separators(rowInk,3), frames=[];
    for(let row=0;row<3;row++) {
      const colInk=new Uint32Array(width);
      for(let y=rows[row];y<rows[row+1];y++) for(let x=0;x<width;x++) if(data[(y*width+x)*4+3]>=alphaThreshold) colInk[x]++;
      const cols=separators(colInk,4);
      for(let col=0;col<4;col++) {
        let {left,top,right,bottom}=actorBounds(data,width,cols[col],rows[row],cols[col+1],rows[row+1]);
        if(right<left || bottom<top) throw new Error(`Empty sprite ${id}/${group}/${frames.length}`);
        // Feet/support center anchors horizontal movement; lying sprites use their footprint.
        let supportSum=0,supportCount=0;
        const supportTop=Math.max(top,bottom-Math.max(5,Math.round((bottom-top)*0.06)));
        for(let y=supportTop;y<=bottom;y++) for(let x=left;x<=right;x++) if(data[(y*width+x)*4+3]>=alphaThreshold) {supportSum+=x;supportCount++;}
        const anchorX=supportCount?Math.round(supportSum/supportCount):Math.round((left+right)/2);
        const anchorY=bottom+1;
        left=Math.max(cols[col],left-2);top=Math.max(rows[row],top-2);
        right=Math.min(cols[col+1]-1,right+2);bottom=Math.min(rows[row+1]-1,bottom+2);
        frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1,anchorX,anchorY,flipX:false});
      }
    }
    const url=`fighters/${id}/${group}.webp`;
    await sharp(file).webp({quality:88,alphaQuality:100,effort:5}).toFile(path.join(root,'public',url));
    character.sheets[group]={url,width,height,referenceHeight:frames[0].h,frames};
    if(group==='movement') {
      const {x:left,y:top,w:width,h:height}=frames[0];
      await sharp(file).extract({left,top,width,height}).resize({height:384}).webp({quality:90,alphaQuality:100}).toFile(path.join(dest,'portrait.webp'));
    }
  }
  output.characters[id]=character;
  console.log(`${id}: 36 frames + portrait`);
}
// Verified reversed retreat drawings. These corrections affect facing, not simulation motion.
for (const [id,index] of [['emberpaw',6],['mossbite',6],['cloudhop',3],['puffvolt',6],['tideknuckle',6]]) output.characters[id].sheets.movement.frames[index].flipX=true;
for (const index of [4,6]) output.characters.pebblepop.sheets.reactions.frames[index].flipX=true;
await fs.mkdir(path.join(root,'public/art'),{recursive:true});
await sharp(path.join(source,'scenes/arena-clean.png')).webp({quality:90,effort:5}).toFile(path.join(root,'public/art/verdant-arena.webp'));
await fs.writeFile(path.join(root,'src/data/fighterAtlas.json'),JSON.stringify(output,null,2)+'\n');
console.log('Wrote 360 frame bounds and original arena.');
