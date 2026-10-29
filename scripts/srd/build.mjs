// Builds the app's D&D 5e (2024) reference data from the System Reference Document 5.2.1,
// by way of the Open Character Format pack @opencharacter/5e-srd-5.2 (CC-BY-4.0), which
// transcribes every class and subclass feature, feat, spell and creature with its rules
// text and its numbers as formulas.
//
//   node scripts/srd/build.mjs
//
// Writes src/systems/dnd5e/srd/*.json. The output is committed; the app never loads the
// pack itself. Per-level numbers (Rage uses, Sneak Attack dice, prepared spells…) are
// worked out here by evaluating the pack's formulas at every class level from 1 to 20.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PACK = 'node_modules/@opencharacter/5e-srd-5.2/dist';
const OUT = 'src/systems/dnd5e/srd';
const release = JSON.parse(readFileSync(`${PACK}/release.json`, 'utf8'));
const en = JSON.parse(readFileSync(`${PACK}/i18n/en.json`, 'utf8'));
const byId = new Map(release.content.map((c) => [c.id, c]));
const formulas = release.formulas;
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const text = (key) => en[key] ?? '';
const short = (id) => id.split('.').pop();

// ── Formula evaluation ───────────────────────────────────────────────────────
// Only what class tables need: arithmetic, comparisons, ternaries, lists, ceil/floor/min/max,
// and dice, over `self.level`. Anything that depends on the character (ability modifiers,
// proficiency bonus) becomes a symbol and is handled by the caller.

class Sym {
  constructor(name) {
    this.name = name;
  }
}

function treeOf(expr) {
  if (typeof expr !== 'string') return null;
  return formulas[expr]?.tree ?? null;
}

function evaluate(node, level) {
  switch (node.type) {
    case 'int':
    case 'decimal':
    case 'string':
    case 'bool':
      return node.value;
    case 'null':
      return null;
    case 'list':
      return node.items.map((n) => evaluate(n, level));
    case 'name': {
      const path = node.path.join('.');
      if (path === 'self.level') return level;
      const ability = /^abilities\.(\w+)\.mod$/.exec(path);
      if (ability) return new Sym(`mod:${ability[1]}`);
      if (path === 'proficiency.bonus') return new Sym('pb');
      return new Sym(path);
    }
    case 'unary': {
      const v = evaluate(node.operand, level);
      if (v instanceof Sym) return v;
      return node.op === '!' ? !v : -v;
    }
    case 'binary': {
      const a = evaluate(node.left, level);
      const b = evaluate(node.right, level);
      if (a instanceof Sym || b instanceof Sym) return new Sym('expr');
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '>=':
          return a >= b;
        case '>':
          return a > b;
        case '<=':
          return a <= b;
        case '<':
          return a < b;
        case '==':
          return a === b;
        case '!=':
          return a !== b;
        case '&&':
          return a && b;
        case '||':
          return a || b;
        default:
          return new Sym('expr');
      }
    }
    case 'conditional': {
      const t = evaluate(node.test, level);
      if (t instanceof Sym) return t;
      return evaluate(t ? node.then : node.else, level);
    }
    case 'index': {
      const o = evaluate(node.object, level);
      const i = evaluate(node.index, level);
      return Array.isArray(o) && typeof i === 'number' ? o[i] : new Sym('expr');
    }
    case 'call': {
      const args = node.args.map((n) => evaluate(n, level));
      if (args.some((a) => a instanceof Sym)) {
        // max(1, abilities.X.mod) is how the rules say "your X modifier, minimum 1".
        if (node.fn === 'max' && args[0] === 1 && args[1] instanceof Sym && args[1].name.startsWith('mod:')) return args[1];
        return new Sym('expr');
      }
      if (node.fn === 'ceil') return Math.ceil(args[0]);
      if (node.fn === 'floor') return Math.floor(args[0]);
      if (node.fn === 'min') return Math.min(...args);
      if (node.fn === 'max') return Math.max(...args);
      return new Sym('expr');
    }
    case 'dice': {
      const n = typeof node.count === 'number' ? node.count : evaluate(node.count, level);
      if (n instanceof Sym) return n;
      return `${n}d${node.sides}`;
    }
    default:
      return new Sym('expr');
  }
}

/** A formula (or plain value) at one class level; undefined when it isn't a level-only number. */
function at(expr, level) {
  if (typeof expr === 'number' || typeof expr === 'boolean') return expr;
  if (typeof expr === 'string' && /^\d+d\d+$/.test(expr)) return expr;
  const tree = treeOf(expr);
  if (!tree) return typeof expr === 'string' && /^-?\d+$/.test(expr) ? Number(expr) : undefined;
  return evaluate(tree, level);
}

/** Per-level values as change points: [[1, 2], [3, 3], …]; a string formula like 'mod:cha'; or null. */
function steps(expr) {
  const values = LEVELS.map((l) => at(expr, l));
  if (values[0] instanceof Sym) return values[0].name.startsWith('mod:') || values[0].name === 'pb' ? values[0].name : null;
  if (values.some((v) => v === undefined || v instanceof Sym || typeof v === 'boolean')) return null;
  const out = [];
  values.forEach((v, i) => {
    if (!out.length || out[out.length - 1][1] !== v) out.push([i + 1, v]);
  });
  return out;
}

function levelOf(when) {
  const m = /self\.level\s*>=\s*(\d+)/.exec(when ?? '');
  return m ? Number(m[1]) : 1;
}

// ── Features ─────────────────────────────────────────────────────────────────

const COUNTERS = /(\.uses|channelDivinity|favoredEnemy|focus\.points|sorcery\.points|layOnHands)$/;
const STAT_LABELS = {
  'rage.damage': 'Rage Damage',
  'martialArts.die': 'Martial Arts die',
  'bardicInspiration.die': 'Bardic Inspiration die',
  'rogue.sneakAttack': 'Sneak Attack dice (d6)',
  'wildShape.forms': 'Known forms',
  'wildShape.maxCr': 'Max CR',
  'wildShape.hours': 'Hours per form',
  'paladin.layOnHands': 'Healing pool (HP)',
  'focus.points': 'Focus Points',
  'sorcery.points': 'Sorcery Points',
};
const humanize = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function castingTimeOf(desc) {
  if (/\bas a Bonus Action\b|\btake a Bonus Action\b|\ba Bonus Action\b/i.test(desc)) return 'bonus';
  if (/\bas a Reaction\b|\btake a Reaction\b/i.test(desc)) return 'reaction';
  if (/\bMagic action\b|\bas an action\b|\btake the \w+ action\b/i.test(desc)) return 'action';
  return 'other';
}

function rechargeOf(item) {
  let short = false;
  let long = false;
  for (const e of item.effects ?? []) {
    const restSteps = e.target && typeof e.target === 'object' ? e.target.steps ?? [] : [];
    if (restSteps.includes('rest.short')) short = true;
    if (restSteps.includes('rest.long')) long = true;
  }
  return short ? 'short' : long ? 'long' : null;
}

/** The first dice roll a feature's action makes, at each level, as app dice notation. */
function rollOf(item) {
  for (const action of item.actions ?? []) {
    for (const step of action.steps ?? []) {
      if (step.kind !== 'roll') continue;
      const tags = JSON.stringify(step.tags ?? []) + JSON.stringify(step.parts ?? []);
      const kind = /healing/.test(tags) ? 'healing' : /damage/.test(tags) ? 'damage' : 'other';
      const damageType = (/damage\.(\w+)/.exec(JSON.stringify(step.parts)) ?? [])[1] ?? null;
      const perLevel = LEVELS.map((l) => {
        const parts = [];
        for (const p of step.parts) {
          if (p.dice) {
            const v = at(p.dice, l);
            if (typeof v !== 'string') return null;
            parts.push(v);
          } else {
            const raw = p.value ?? (typeof p.field === 'string' ? p.field.replace(/'/g, '') : null);
            const ability = /^abilities\.(\w+)\.mod$/.exec(raw ?? '');
            if (ability) parts.push(`{${ability[1].toUpperCase()}}`);
            else {
              const v = at(raw, l);
              if (typeof v !== 'number') return null;
              parts.push(String(v));
            }
          }
        }
        return parts.join('+');
      });
      if (perLevel.some((r) => r === null)) continue;
      const out = [];
      perLevel.forEach((r, i) => (!out.length || out[out.length - 1][1] !== r) && out.push([i + 1, r]));
      return { roll: out, rollKind: kind, damageType };
    }
  }
  return null;
}

function feature(id, level) {
  const item = byId.get(id);
  if (!item) throw new Error(`missing ${id}`);
  const desc = text(`${id}.description`);
  const f = { key: short(id), id, name: text(`${id}.name`) || humanize(short(id)), level, text: desc };
  const stats = [];
  for (const e of item.effects ?? []) {
    if (typeof e.target !== 'string' || e.op !== 'set') continue;
    const s = steps(e.value);
    if (!s) continue;
    if (COUNTERS.test(e.target) && !f.uses) f.uses = s;
    else if (Array.isArray(s) && (s.length > 1 || STAT_LABELS[e.target])) stats.push({ label: STAT_LABELS[e.target] ?? humanize(e.target.split('.').pop()), steps: s });
  }
  for (const ch of item.choices ?? []) {
    // "Choose N" counts that grow with level: weapon masteries, cantrips, prepared spells.
    if (ch.pick === undefined || typeof ch.pick === 'number') continue;
    const s = steps(ch.pick);
    if (Array.isArray(s)) stats.push({ label: humanize(ch.id), steps: s });
  }
  if (stats.length) f.stats = stats;
  const recharge = rechargeOf(item);
  if (recharge) f.recharge = recharge;
  const roll = rollOf(item);
  if (roll) Object.assign(f, roll);
  f.castingTime = castingTimeOf(desc);
  const asi = (item.choices ?? []).find((c) => c.from?.type === 'feat' && Array.isArray(c.slots));
  if (asi) f.featSlots = asi.slots;
  const featChoice = (item.choices ?? []).find((c) => c.from?.type === 'feat' && !Array.isArray(c.slots));
  if (featChoice) f.featCategory = (/item\.category == '([\w-]+)'/.exec(featChoice.from.where ?? '') ?? [])[1] ?? (/epic-boon/.test(id) ? 'epic-boon' : 'any');
  return f;
}

function grantsOf(item) {
  return (item.grants ?? []).filter((g) => typeof g.item === 'string' && g.item.startsWith('features.')).map((g) => feature(g.item, levelOf(g.when)));
}

// ── Classes ──────────────────────────────────────────────────────────────────

const classes = release.content
  .filter((c) => c.type === 'class')
  .map((c) => {
    const id = short(c.id);
    const fields = c.fields ?? {};
    const prof = { armor: [], weapons: [], saves: [], multiclassArmor: [], multiclassWeapons: [] };
    for (const e of c.effects ?? []) {
      const starting = /startingClass/.test(e.when ?? '');
      const v = e.value ?? {};
      const what = v.tag ?? (/category == '(\w+)'/.exec(v.query?.where ?? '') ?? [])[1] ?? (v.query?.where ?? '').replace(/item\.|'/g, '');
      if (e.target === 'proficiencies.saves') prof.saves.push(String(v.tag).replace('save.', ''));
      if (e.target === 'proficiencies.armor') (starting ? prof.armor : (prof.armor.push(what), prof.multiclassArmor)).push(what);
      if (e.target === 'proficiencies.weapons') (starting ? prof.weapons : (prof.weapons.push(what), prof.multiclassWeapons)).push(what);
    }
    const skills = (c.choices ?? []).find((ch) => ch.id === 'skills');
    const subclassChoice = (c.choices ?? []).find((ch) => ch.id === 'subclass');
    const features = grantsOf(c);
    const casting = features.find((f) => f.key === 'spellcasting' || f.key === 'pact-magic');
    const castingItem = casting && byId.get(casting.id);
    const pickSteps = (name) => {
      const ch = (castingItem?.choices ?? []).find((x) => x.id === name);
      return ch ? steps(ch.pick) : null;
    };
    const asi = features.find((f) => f.featSlots);
    const boon = features.find((f) => f.featCategory === 'epic-boon' || /epic-boon/.test(f.id));
    return {
      id,
      name: text(`${c.id}.name`) || humanize(id),
      hitDie: Number(String(fields.hitDie).replace('1d', '')),
      multiclass: fields.multiclassAll ? { all: fields.multiclassAll } : { any: fields.multiclassAny ?? [] },
      saves: prof.saves,
      armor: [...new Set(prof.armor)],
      weapons: [...new Set(prof.weapons)],
      multiclassArmor: [...new Set(prof.multiclassArmor)],
      multiclassWeapons: [...new Set(prof.multiclassWeapons)],
      skills: skills ? { pick: skills.pick, from: (skills.from?.values ?? []).map((s) => s.replace('skill.', '').replace(/-/g, '_')) } : null,
      subclassLevel: subclassChoice ? levelOf(subclassChoice.when) : 3,
      asiLevels: asi?.featSlots ?? [],
      epicBoonLevel: boon?.level ?? null,
      cantrips: pickSteps('cantrips'),
      prepared: pickSteps('prepared') ?? pickSteps('spells'),
      features: features.sort((a, b) => a.level - b.level).map(({ featSlots, ...f }) => f),
    };
  });

const subclasses = release.content
  .filter((c) => c.type === 'subclass')
  .map((c) => ({ id: short(c.id), name: text(`${c.id}.name`) || humanize(short(c.id)), classId: short(c.fields.class), text: text(`${c.id}.description`), features: grantsOf(c).sort((a, b) => a.level - b.level) }));

// ── Feats ────────────────────────────────────────────────────────────────────

const feats = release.content
  .filter((c) => c.type === 'feat')
  .map((c) => {
    const abilityChoice = (c.choices ?? []).find((ch) => ch.id === 'ability');
    const abilities = abilityChoice?.from?.options?.map((o) => o.id).filter((a) => ABILITIES.includes(a)) ?? [];
    return {
      id: short(c.id),
      name: text(`${c.id}.name`),
      category: c.fields?.category ?? 'general',
      repeatable: (c.tags ?? []).includes('repeatable') || c.id === 'feats.ability-score-improvement',
      minLevel: Math.max(1, ...(c.prerequisites ?? []).map((p) => (/level\.total >= (\d+)/.exec(p.when ?? '') ?? [0, 1])[1]).map(Number)),
      abilities,
      text: text(`${c.id}.description`),
    };
  });

// ── Spells ───────────────────────────────────────────────────────────────────

const SCHOOL_ELEMENT = { abjuration: 'arcane', conjuration: 'force', divination: 'arcane', enchantment: 'psychic', evocation: 'arcane', illusion: 'shadow', necromancy: 'necrotic', transmutation: 'nature' };
const CAST = { action: ['action', 'Action'], 'bonus-action': ['bonus', 'Bonus Action'], reaction: ['reaction', 'Reaction'] };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function spell(c) {
  const f = c.fields;
  const id = short(c.id);
  const desc = text(`${c.id}.description`);
  const [castingTime, castingTimeText] = CAST[f.castingTime] ?? ['other', f.castingTime.replace('-', ' ').replace(/^(\d+) (\w+)$/, '$1 $2')];
  const area = f.areaShape ? `${f.areaSize}-foot ${f.areaShape === 'sphere' ? 'radius ' : ''}${f.areaShape}` : '';
  const range =
    f.rangeKind === 'self' ? (area ? `Self (${area})` : 'Self') : f.rangeKind === 'touch' ? 'Touch' : f.rangeKind === 'ranged' ? `${f.range} feet` : cap(f.rangeKind);
  const material = text(`${c.id}.texts.material`);
  const components = [f.verbal && 'V', f.somatic && 'S', f.material && (material ? `M (${material})` : 'M')].filter(Boolean).join(', ');
  const durationBase =
    f.durationUnit === 'instantaneous'
      ? 'Instantaneous'
      : f.durationUnit === 'until-dispelled'
        ? 'Until dispelled'
        : f.durationUnit === 'special'
          ? 'Special'
          : `${f.durationAmount ?? 1} ${f.durationUnit}${(f.durationAmount ?? 1) > 1 ? 's' : ''}`;
  const duration = f.concentration ? `Concentration, up to ${durationBase}` : durationBase;

  // Mechanics from the pack's fields, falling back on the rules text for spells the pack models as custom actions.
  const attack = f.attack ?? (/make a (ranged|melee) spell attack/i.exec(desc) ?? [])[1];
  const saveWord = (/makes? an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/.exec(desc) ?? [])[1];
  const save = f.save ?? (saveWord ? saveWord.slice(0, 3).toLowerCase() : undefined);
  let damage = [];
  if (f.damage) {
    damage.push({ dice: String(f.damage).replace(/\s+/g, '') + (f.damageAddsMod ? '+{MOD}' : '') + (f.damageBonus ? `+${f.damageBonus}` : ''), type: f.damageType });
    if (f.damage2) damage.push({ dice: String(f.damage2).replace(/\s+/g, ''), type: f.damage2Type });
  } else {
    const m = /(\d+d\d+(?: \+ \d+)?) (Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage/.exec(desc);
    if (m && (attack || save)) damage.push({ dice: m[1].replace(/\s+/g, ''), type: m[2].toLowerCase() });
  }
  const healing = f.heal ? String(f.heal).replace(/\s+/g, '') + (f.healAddsMod ? '+{MOD}' : '') + (f.healBonus ? `+${f.healBonus}` : '') : '';
  const resolution = healing ? 'heal' : attack ? 'attack' : save ? 'save' : damage.length ? 'auto' : 'utility';
  const firstDie = (damage[0]?.dice ?? healing).match(/\d+d(\d+)/)?.[1];
  const upcastCount = f.upcastDice ?? f.upcastHealDice;
  const element = damage[0]?.type ?? (healing ? 'healing' : SCHOOL_ELEMENT[f.school] ?? 'arcane');
  const shape = f.areaShape
    ? f.areaShape === 'cone'
      ? 'cone'
      : f.areaShape === 'line'
        ? 'line'
        : f.areaShape === 'emanation' || f.rangeKind === 'self'
          ? 'aura'
          : f.areaShape === 'cylinder'
            ? 'rain'
            : 'burst'
    : attack === 'melee' || f.rangeKind === 'touch'
      ? 'touch'
      : f.rangeKind === 'self'
        ? 'aura'
        : attack
          ? 'bolt'
          : save
            ? 'ray'
            : healing
              ? 'bolt'
              : 'aura';
  return {
    srd: id,
    name: text(`${c.id}.name`),
    level: f.level,
    school: cap(f.school),
    classes: (f.classes ?? []).map(short),
    castingTime,
    castingTimeText,
    range,
    components,
    duration,
    concentration: !!f.concentration,
    ritual: !!f.ritual,
    resolution,
    saveAbility: save ?? 'dex',
    halfOnSave: f.saveEffect === 'half' || /half as much damage on a successful/i.test(desc),
    damage,
    healing,
    upcastDice: upcastCount && firstDie ? `${upcastCount}d${firstDie}` : '',
    instances: 1,
    upcastInstances: 0,
    scaling: f.cantripScaling || (f.level === 0 && damage.length && /Cantrip Upgrade/.test(desc)) ? 'cantrip_dice' : 'none',
    element,
    shape,
    description: desc,
  };
}

const spells = release.content.filter((c) => c.type === 'spell').map(spell);

// ── Creatures ────────────────────────────────────────────────────────────────

const SIZE = { tiny: 'Tiny', small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan' };
function creature(c) {
  const f = c.fields;
  const actions = (f.entries ?? []).map((eid) => {
    const e = byId.get(eid);
    const a = e?.fields ?? {};
    return {
      kind: a.kind ?? 'action',
      name: text(`${eid}.name`),
      text: text(`${eid}.description`),
      ...(a.attack ? { attack: a.attack, toHit: a.toHit, reach: a.reach, range: a.range, damage: a.damage ? String(a.damage).replace(/\s+/g, '') : '', damageType: a.damageType } : {}),
      ...(a.save ? { save: a.save, dc: a.saveDc } : {}),
    };
  });
  const speeds = [`${f.speed} ft.`, f.flySpeed && `Fly ${f.flySpeed} ft.${f.hover ? ' (hover)' : ''}`, f.swimSpeed && `Swim ${f.swimSpeed} ft.`, f.climbSpeed && `Climb ${f.climbSpeed} ft.`, f.burrowSpeed && `Burrow ${f.burrowSpeed} ft.`].filter(Boolean);
  const senses = [f.blindsight && `Blindsight ${f.blindsight} ft.`, f.darkvision && `Darkvision ${f.darkvision} ft.`, f.tremorsense && `Tremorsense ${f.tremorsense} ft.`, f.truesight && `Truesight ${f.truesight} ft.`].filter(Boolean);
  return {
    srd: short(c.id),
    name: text(`${c.id}.name`),
    size: SIZE[f.size] ?? f.size,
    type: f.creatureType,
    alignment: f.alignment?.replace(/-/g, ' '),
    ac: f.ac,
    hp: f.hp,
    hitDice: f.hitDice,
    speed: speeds.join(', '),
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, f[a]])),
    saves: (f.saves ?? []).map((s) => s.replace('save.', '')),
    skills: (f.skills ?? []).map((s) => s.replace('skill.', '')),
    senses: senses.join(', '),
    languages: (f.languages ?? []).map(short).join(', '),
    cr: f.cr,
    actions,
  };
}

const creatures = release.content.filter((c) => c.type === 'monster').map(creature);

// ── Items ────────────────────────────────────────────────────────────────────
// Weapons, armor, gear, tools and magic items. Magic weapons and armor that are made from
// a base item ("Flame Tongue {base}", "{base} +1") become templates listing the bases they
// fit, with their bonuses and any extra damage dice they always add.

const label = (s) => cap(String(s).replace(/-/g, ' '));
const PROPERTY_ORDER = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'];

function weaponStats(c) {
  const f = c.fields;
  const tags = new Set(c.tags);
  const range = f.normalRange ? ` (${f.normalRange}/${f.longRange})` : '';
  const props = [];
  if (tags.has('ammunition')) props.push(`Ammunition${range}`);
  if (tags.has('finesse')) props.push('Finesse');
  if (tags.has('property.heavy')) props.push('Heavy');
  if (tags.has('property.light')) props.push('Light');
  if (tags.has('loading')) props.push('Loading');
  if (tags.has('reach')) props.push('Reach');
  if (tags.has('thrown')) props.push(`Thrown${range}`);
  if (tags.has('two-handed')) props.push('Two-Handed');
  if (f.versatileDamage) props.push(`Versatile (${f.versatileDamage})`);
  props.sort((a, b) => PROPERTY_ORDER.indexOf(a.replace(/ \(.*/, '')) - PROPERTY_ORDER.indexOf(b.replace(/ \(.*/, '')));
  return {
    dice: f.damage,
    type: f.damageType,
    category: f.category,
    ranged: f.range === 'ranged',
    finesse: tags.has('finesse'),
    properties: props.join(', '),
    mastery: f.mastery ? cap(f.mastery) : '',
    ...(f.normalRange ? { range: [f.normalRange, f.longRange] } : {}),
  };
}

const baseWeapons = release.content.filter((c) => c.type === 'weapon');
const baseArmor = release.content.filter((c) => c.type === 'armor');
const ammunition = release.content.filter((c) => c.type === 'gear' && c.fields?.category === 'ammunition');

/** The base items a magic template fits, from its `appliesTo` condition. */
function basesOf(applies) {
  const where = applies.where ?? '';
  const pool = applies.type === 'weapon' ? baseWeapons : applies.type === 'armor' ? baseArmor : ammunition;
  const ids = [...where.matchAll(/@([a-z-]+\.[a-z0-9-]+)/g)].map((m) => m[1]);
  return pool
    .filter((c) => {
      if (/item\.id (?:in|==)/.test(where)) return ids.includes(c.id);
      if (/item\.range == 'melee'/.test(where) && c.fields.range !== 'melee') return false;
      if (/item\.category == 'shield'/.test(where) && c.fields.category !== 'shield') return false;
      if (/item\.category != 'shield'/.test(where) && c.fields.category === 'shield') return false;
      if (/item\.category in \['medium', 'heavy'\]/.test(where) && !['medium', 'heavy'].includes(c.fields.category)) return false;
      if (/item\.id != @armor\.hide/.test(where) && c.id === 'armor.hide') return false;
      return true;
    })
    .map((c) => text(`${c.id}.name`));
}

/** Extra damage a magic weapon always adds (or adds while the wielder switches it on, like Flame Tongue's flames). */
function extraDamageOf(c) {
  const out = [];
  for (const e of c.effects ?? []) {
    if (e.op !== 'add' || !e.target?.rolls?.includes('damage.weapon') || typeof e.value !== 'string' || !/^\s*\d*d\d+\s*$/.test(e.value)) continue;
    // Only dice that come with attunement, or with a switch the wielder flips (Flame Tongue's
    // flames). Damage against certain targets, or from a power picked on a hit, isn't rolled every time.
    const rest = (e.when ?? '').replace(/self\.\w+/g, '').replace(/&&|\s/g, '');
    if (rest) continue;
    const tag = e.tags?.[0];
    const type = typeof tag === 'string' ? tag.replace('damage.', '') : 'same';
    out.push({ dice: e.value.replace(/\s+/g, ''), type });
  }
  return out;
}

function item(c) {
  const f = c.fields ?? {};
  const base = { id: '', name: text(`${c.id}.name`), text: text(`${c.id}.description`), ...(f.weight ? { weight: f.weight } : {}), ...(f.cost ? { cost: f.cost } : {}) };
  if (c.type === 'weapon') return { ...base, id: `w:${short(c.id)}`, kind: 'weapon', category: `${label(f.category)} ${f.range === 'ranged' ? 'ranged' : 'melee'} weapon`, weapon: weaponStats(c) };
  if (c.type === 'armor')
    return {
      ...base,
      id: `a:${short(c.id)}`,
      kind: 'armor',
      category: f.category === 'shield' ? 'Shield' : `${label(f.category)} armor`,
      armor: {
        category: f.category,
        base: f.baseAc,
        ...(f.category === 'medium' ? { maxDex: 2 } : {}),
        ...(f.strength ? { strength: f.strength } : {}),
        ...(f.stealthDisadvantage ? { stealth: true } : {}),
      },
    };
  if (c.type === 'gear') return { ...base, id: `g:${short(c.id)}`, kind: 'gear', category: label(f.category) };
  if (c.type === 'tool') return { ...base, id: `t:${short(c.id)}`, kind: 'tool', category: f.category === 'other' ? 'Tool' : label(f.category).replace(/s$/, '') };
  // Magic items, standalone or built on a base item.
  const magic = {
    ...base,
    id: `m:${short(c.id)}`,
    kind: 'magic',
    rarity: label(f.rarity),
    ...(f.requiresAttunement ? { attunement: true } : {}),
    ...(f.maxCharges ? { charges: f.maxCharges } : {}),
  };
  if (c.type === 'magicItem') return { ...magic, category: label(f.category) };
  const applies = c.appliesTo.type === 'gear' ? 'ammunition' : c.appliesTo.type === 'armor' && /== 'shield'/.test(c.appliesTo.where ?? '') ? 'shield' : c.appliesTo.type;
  const extra = extraDamageOf(c);
  return {
    ...magic,
    category: applies === 'weapon' ? 'Weapon' : applies === 'shield' ? 'Shield' : applies === 'armor' ? 'Armor' : 'Ammunition',
    template: {
      applies,
      bases: basesOf(c.appliesTo),
      ...(f.attackBonus ? { attackBonus: f.attackBonus } : {}),
      ...(f.damageBonus ? { damageBonus: f.damageBonus } : {}),
      ...(f.acBonus ? { acBonus: f.acBonus } : {}),
      ...(extra.length ? { extraDamage: extra } : {}),
    },
  };
}

const items = [
  ...baseWeapons,
  ...baseArmor,
  ...release.content.filter((c) => c.type === 'gear' || c.type === 'tool'),
  ...release.content.filter((c) => c.type === 'magicItem' || (c.type === 'template' && c.id.startsWith('magic-items.') && c.appliesTo)),
].map(item);
const languages = release.content.filter((c) => c.type === 'language').map((c) => ({ name: text(`${c.id}.name`), ...(c.fields?.rare ? { rare: true } : {}) }));

// ── Write ────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });
const write = (name, data) => {
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data));
  console.log(`${name}.json: ${data.length} entries, ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
};
write('classes', classes);
write('subclasses', subclasses);
write('feats', feats);
write('spells', spells);
write('creatures', creatures);
write('items', items);
write('languages', languages);
writeFileSync(`${OUT}/credit.json`, JSON.stringify({ source: 'System Reference Document 5.2.1', via: `@opencharacter/5e-srd-5.2 ${release.manifest.version}`, credit: release.manifest.credit }));
