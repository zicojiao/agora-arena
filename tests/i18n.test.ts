import { afterEach, describe, expect, it, vi } from 'vitest';
import { EN } from '../src/i18n/en';
import { ZH } from '../src/i18n/zh';
import { FIGHTERS_ZH, localizeFighter } from '../src/i18n/fighters';
import { getLang, setLang, t, type StringKey } from '../src/i18n';
import { GOAT_ROSTER } from '../src/data/goats';
import { fighterById, localizedRoster, stageById, stageLabel, difficultyLabel } from '../src/game/setup';
import { buildUltimatePrompt } from '../src/game/ultimatePrompt';
import { composeMove } from '../src/game/voiceMove';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

afterEach(() => { setLang('en'); vi.unstubAllGlobals(); });

describe('interface strings', () => {
  it('Chinese covers every English key with the same placeholders', () => {
    const keys = Object.keys(EN) as StringKey[];
    expect(Object.keys(ZH).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(ZH[key].trim(), `${key} is empty in Chinese`).not.toBe('');
      expect(placeholders(ZH[key]), `${key} placeholders differ`).toEqual(placeholders(EN[key]));
    }
  });

  it('Chinese strings that tell the player how to speak ask for Chinese, never English', () => {
    for (const key of ['ult.mic.listening', 'ult.description', 'ult.hint.idle', 'howto.ult.3', 'guide.ultimateHint', 'err.noSpeech', 'settings.voice.hint'] as const) {
      expect(ZH[key], key).toMatch(/中文/);
      expect(ZH[key], key).not.toMatch(/English/i);
    }
  });

  it('fills placeholders and switches language at runtime', () => {
    expect(t('hud.round', { n: 2 })).toBe('ROUND 2');
    setLang('zh');
    expect(getLang()).toBe('zh');
    expect(t('hud.round', { n: 2 })).toBe('第 2 回合');
    expect(t('result.wins', { name: '焰爪' })).toBe('焰爪 获胜');
  });
});

describe('fighters in Chinese', () => {
  it('every fighter has a Chinese name, role, nine move names and four lines', () => {
    for (const f of GOAT_ROSTER) {
      const zh = FIGHTERS_ZH[f.id];
      expect(zh, `${f.id} has no Chinese text`).toBeTruthy();
      expect(zh.moves).toHaveLength(9);
      expect(new Set(zh.moves).size, `${f.id} repeats a move name`).toBe(9);
      for (const line of Object.values(zh.quotes)) expect(line).toMatch(/[一-鿿]/);
    }
    expect(new Set(Object.values(FIGHTERS_ZH).map(f => f.name)).size).toBe(GOAT_ROSTER.length);
  });

  it('translation changes only text: ids, stats and move data stay the same', () => {
    const en = GOAT_ROSTER[0];
    const zh = localizeFighter(en, 'zh');
    expect(zh.id).toBe(en.id);
    expect(zh.hp).toBe(en.hp);
    expect(zh.moves.s1.damage).toBe(en.moves.s1.damage);
    expect(zh.moves.s1.id).toBe(en.moves.s1.id);
    expect(zh.name).toBe('焰爪');
    expect(zh.moves.sp100.name).toBe('火焰之心');
    expect(en.name).toBe('EMBERPAW');
  });

  it('menus and matches pick up the current language', () => {
    expect(fighterById('cloudhop').name).toBe('CLOUDHOP');
    setLang('zh');
    expect(fighterById('cloudhop').name).toBe('云跳');
    expect(localizedRoster().map(f => f.name)).toContain('潮拳');
    expect(stageLabel(stageById('nightfall'))).toEqual({ name: '翠野竞技场', time: '夜幕' });
    expect(difficultyLabel('legend').name).toBe('挑战');
  });
});

describe('Chinese FastH3 prompt', () => {
  const caster = { id: 'emberpaw', name: '焰爪' }, target = { id: 'cloudhop', name: '云跳' };
  const move = { name: '巨大水龙', description: '召唤一条巨大的水龙从天而降砸向对手', transcript: '召唤一条巨大的水龙从天而降砸向对手' };

  it('is written in Chinese and keeps the player words verbatim', () => {
    const prompt = buildUltimatePrompt({ caster, target, casterSide: 'left', move, lang: 'zh' });
    expect(prompt).toContain('<Subject 1> 是焰爪，位于 <Picture 1> 左侧的攻击者');
    expect(prompt).toContain('<Subject 2> 是云跳，位于右侧的目标');
    expect(prompt).toContain('玩家的招式“巨大水龙”：召唤一条巨大的水龙从天而降砸向对手');
    expect(prompt).toContain('<Subject 1> 用中文大喊：“巨大水龙！”');
    // Only the structural labels and product names stay in Latin script.
    const latin = prompt.replace(/<(Picture|Subject) \d>/g, '').match(/[A-Za-z]{3,}/g) ?? [];
    expect(latin).toEqual([]);
  });

  it('mirrors sides and direction when the caster stands on the right', () => {
    const prompt = buildUltimatePrompt({ caster, target, casterSide: 'right', move, lang: 'zh' });
    expect(prompt).toContain('位于 <Picture 1> 右侧的攻击者');
    expect(prompt).toContain('<Subject 1> 把攻击向左直接打向 <Subject 2>');
    expect(prompt).toContain('<Subject 2> 被向左轰飞');
  });

  it('English stays the default', () => {
    const prompt = buildUltimatePrompt({ caster: { id: 'emberpaw', name: 'EMBERPAW' }, target: { id: 'cloudhop', name: 'CLOUDHOP' }, casterSide: 'left', move: { name: 'Fire Dragon', description: 'A fire dragon hits the rabbit' } });
    expect(prompt).toContain('<Subject 1> is Emberpaw');
    expect(prompt).not.toMatch(/[一-鿿]/);
  });
});

describe('voice requests carry the language', () => {
  it('composeMove asks the server to name the move in Chinese', async () => {
    const fetch = vi.fn(async () => Response.json({ transcript: '火龙拳', name: '火龙拳', description: '火龙拳' }));
    vi.stubGlobal('fetch', fetch);
    await composeMove('火龙拳', '焰爪', '云跳', 'zh');
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toContain('lang=zh');
  });
});
