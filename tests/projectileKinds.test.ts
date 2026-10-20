import { expect, test } from 'vitest';
import { drawProjectiles } from '../src/render/renderer';
import { CHARACTERS } from '../src/data/characters';
import type { Battle } from '../src/engine/battle';

const KINDS = ['ring', 'beam', 'fan', 'arrow', 'wraith', 'roar'] as const;

function trace(kind: string): string {
  const calls: string[] = [];
  const grad = { addColorStop() {} };
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() { calls.push('rotate'); },
    beginPath() {}, closePath() {}, fill() { calls.push('fill'); },
    stroke() { calls.push('stroke'); },
    moveTo() { calls.push('moveTo'); }, lineTo() { calls.push('lineTo'); },
    arc() { calls.push('arc'); }, ellipse() { calls.push('ellipse'); },
    quadraticCurveTo() { calls.push('quad'); },
    fillRect() { calls.push('fillRect'); },
    createLinearGradient() { calls.push('grad'); return grad; },
    set globalAlpha(_v: number) {}, set globalCompositeOperation(_v: string) {},
    set fillStyle(_v: unknown) {}, set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
  } as unknown as CanvasRenderingContext2D;
  const b = { projectiles: [{ x: 0, y: 0, age: 3, life: 40, facing: 1,
    def: { w: 44, h: 16, color: '#ffb340', kind } }] } as unknown as Battle;
  drawProjectiles(ctx, b);
  return calls.join(',');
}

test('每一种弹都有自己的画法——新加 kind 不会静默掉进芭蕉扇分支', () => {
  // switch 的最后一支是 else（芭蕉扇），所以任何没写分支的 kind 都会被画成扇子，
  // 而且不报错、不留痕。后羿三支箭此前就是共用 'beam'：一根渐变长条 + 椭圆亮头，
  // 全场唯一的弓箭手，射出去的东西和二郎神的天眼光束长得一模一样。
  const seen = new Map<string, string>();
  for (const k of KINDS) {
    const t = trace(k);
    expect(t.length, `${k} 什么都没画`).toBeGreaterThan(0);
    const dup = [...seen.entries()].find(([, v]) => v === t);
    expect(dup, `${k} 的画法与 ${dup?.[0]} 完全一致——它多半没有自己的分支`).toBeUndefined();
    seen.set(k, t);
  }
});

test('后羿的箭不是光束——全场唯一的弓箭手，弹的样子必须是箭', () => {
  const hy = CHARACTERS.find(c => c.id === 'houyi')!;
  const kinds = (['s1', 's2', 's3'] as const).map(k => hy.moves[k].projectile?.kind);
  expect(kinds).toEqual(['arrow', 'arrow', 'arrow']);
});
