import { useEffect, useMemo, useState } from 'react';
import { rollDie } from '../engine/dice';
import { fx, sound } from '../fx';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type SkillId } from '../systems/dnd5e/data';
import { ABILITY_CAP, BOON_CAP, applyLevelUp, hpGain, planLevelUp, statsLine, type LevelUpChoices } from '../systems/dnd5e/leveling';
import { totalLevel } from '../systems/dnd5e/rules';
import type { FeatDef } from '../systems/dnd5e/srd';
import { RulesText } from './RulesText';
import { Check, Dialog } from './ui';

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function slotText(slots: number[]): string {
  const used = slots.map((n, i) => (n ? `${n}×${ORDINAL[i + 1]}` : '')).filter(Boolean);
  return used.length ? used.join(', ') : 'none';
}

/**
 * Level up: pick the class, take the average or roll for hit points, see what the level
 * brings, and make its choices (subclass, Ability Score Improvement or feat, Fighting
 * Style, Epic Boon, a multiclass skill). Nothing changes until you confirm.
 */
export function LevelUpDialog(props: { onClose: () => void; onDone: (message: string) => void }) {
  const { char: c, update } = useChar();
  const cat = useCatalog();
  const best = useMemo(() => [...ABILITIES].sort((a, b) => c.abilities[b] - c.abilities[a]), [c.abilities]);
  const [classId, setClassId] = useState(c.classes[0]?.classId ?? 'fighter');
  const [ignorePrereq, setIgnorePrereq] = useState(false);
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average');
  const [rolled, setRolled] = useState<number | null>(null);
  const [spinning, setSpinning] = useState<number | null>(null);
  const [subPick, setSubPick] = useState('');
  const [subName, setSubName] = useState('');
  const [improve, setImprove] = useState<'asi' | 'feat'>('asi');
  const [asiSplit, setAsiSplit] = useState<'one' | 'two'>('one');
  const [a1, setA1] = useState<Ability>(best[0]);
  const [a2, setA2] = useState<Ability>(best[1]);
  const [featId, setFeatId] = useState('');
  const [featAbility, setFeatAbility] = useState<Ability | ''>('');
  const [customFeat, setCustomFeat] = useState('');
  const [boonId, setBoonId] = useState('');
  const [boonAbility, setBoonAbility] = useState<Ability | ''>('');
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [skill, setSkill] = useState<SkillId | ''>('');

  const plan = cat ? planLevelUp(c, cat, classId) : null;
  // A new class or level resets the roll.
  useEffect(() => {
    setRolled(null);
    setSubPick('');
  }, [classId]);

  if (!cat) {
    return (
      <Dialog title="Level up" onClose={props.onClose}>
        <p className="hint">Loading the rules…</p>
      </Dialog>
    );
  }
  if (totalLevel(c) >= 20) {
    return (
      <Dialog title="Level up" onClose={props.onClose}>
        <p className="hint">You’re level 20, the highest level in the rules. Epic Boons are the way to keep growing.</p>
      </Dialog>
    );
  }

  const held = new Set(c.classes.map((k) => k.classId));
  const others = cat.classes.filter((k) => !held.has(k.id));
  const featById = (id: string) => cat.feats.find((f) => f.id === id);
  const level = plan ? plan.totalLevel : totalLevel(c) + 1;
  const improvementFeats = cat.feats.filter((f) => (f.category === 'general' || f.category === 'origin') && f.id !== 'ability-score-improvement' && f.minLevel <= level);
  const boons = cat.feats.filter((f) => f.category === 'epic-boon');
  const chosenFeat = featById(featId);
  const chosenBoon = featById(boonId);

  const roll = () => {
    if (!plan || spinning !== null) return;
    const result = rollDie(plan.hitDie);
    sound.dice(1);
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks++;
      setSpinning(rollDie(plan.hitDie));
      if (ticks >= 10) {
        window.clearInterval(timer);
        setSpinning(null);
        setRolled(result);
        sound.diceHit(0.5);
      }
    }, 60);
  };

  const asiValid = improve === 'asi' ? asiSplit === 'one' || a1 !== a2 : !!(chosenFeat ? !chosenFeat.abilities.length || featAbility : customFeat.trim());
  const blockers: string[] = [];
  if (!plan) blockers.push('That class can’t go higher.');
  if (plan?.multiclass && !plan.multiclass.ok && !ignorePrereq) blockers.push('The multiclass requirements aren’t met.');
  if (hpMode === 'roll' && rolled === null) blockers.push('Roll your hit die, or take the average.');
  if (plan?.asi && !asiValid) blockers.push(improve === 'asi' ? 'Pick two different abilities for +1 each.' : 'Pick a feat (and its ability).');
  if (plan?.epicBoon && boonId && chosenBoon?.abilities.length && !boonAbility) blockers.push('Pick the ability your Epic Boon raises.');
  if (plan?.subclassOptions && subPick === 'custom' && !subName.trim()) blockers.push('Name your subclass.');

  const confirm = () => {
    if (!plan || blockers.length) return;
    const choices: LevelUpChoices = { hpRoll: hpMode === 'roll' ? rolled : null };
    if (plan.subclassOptions && subPick) {
      const s = cat.subclasses.find((x) => x.id === subPick);
      choices.subclass = s ? { id: s.id, name: s.name } : subPick === 'custom' ? { name: subName.trim() } : undefined;
    }
    const feats: NonNullable<LevelUpChoices['feats']> = [];
    if (plan.asi) {
      if (improve === 'asi') choices.asi = asiSplit === 'one' ? { [a1]: 2 } : { [a1]: 1, [a2]: 1 };
      else if (chosenFeat) feats.push({ feat: chosenFeat, ability: featAbility || undefined });
      else choices.customFeat = customFeat;
    }
    if (plan.epicBoon && chosenBoon) feats.push({ feat: chosenBoon, ability: boonAbility || undefined, boon: true });
    for (const pick of plan.featPicks) {
      const f = featById(styles[pick.feature.id] ?? '');
      if (f) feats.push({ feat: f });
    }
    if (feats.length) choices.feats = feats;
    if (plan.skillPick && skill) choices.skills = [skill];
    update((d) => applyLevelUp(d, cat, plan, choices));
    sound.critical();
    fx.critical({ x: window.innerWidth / 2, y: window.innerHeight * 0.4 }, 'arcane', `LEVEL ${plan.totalLevel}!`);
    props.onDone(`Level ${plan.totalLevel}: ${plan.className} ${plan.classLevel}, +${hpGain(plan, choices.hpRoll)} HP`);
    props.onClose();
  };

  const abilityPicker = (value: Ability | '', set: (a: Ability) => void, options: Ability[], cap: number, label: string) => (
    <select className="input" value={value} aria-label={label} onChange={(e) => set(e.target.value as Ability)}>
      <option value="" disabled>
        Choose…
      </option>
      {options.map((a) => (
        <option key={a} value={a} disabled={c.abilities[a] >= cap}>
          {ABILITY_NAMES[a]} ({c.abilities[a]}
          {c.abilities[a] >= cap ? ', at max' : ''})
        </option>
      ))}
    </select>
  );

  return (
    <Dialog title="Level up" onClose={props.onClose}>
      <div className="levelup">
        <section>
          <h3>Class</h3>
          <div className="seg wrap" role="radiogroup" aria-label="Class to level">
            {c.classes.map((k) => {
              const name = cat.classes.find((x) => x.id === k.classId)?.name ?? k.classId;
              return (
                <button key={k.id} type="button" role="radio" aria-checked={classId === k.classId} disabled={k.level >= 20} onClick={() => setClassId(k.classId)}>
                  {name} {k.level} → {k.level + 1}
                </button>
              );
            })}
          </div>
          {others.length > 0 && (
            <label className="field" style={{ marginTop: 8 }}>
              <span>Or take a level in a new class (multiclass)</span>
              <select className="input" value={held.has(classId) ? '' : classId} onChange={(e) => e.target.value && setClassId(e.target.value)}>
                <option value="">Choose a class…</option>
                {others.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                    {k.source && k.source !== 'SRD 5.2.1' ? ` (${k.source})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {plan?.multiclass && (
            <div className={plan.multiclass.ok ? 'note good' : 'note warn'}>
              <b>{plan.multiclass.ok ? 'You meet the multiclass requirements.' : 'Multiclassing needs 13 in each class’s main ability:'}</b>
              <ul>
                {plan.multiclass.requirements.map((r) => (
                  <li key={r.className}>
                    {r.met ? '✓' : '✗'} {r.className}: {r.needs}
                  </li>
                ))}
              </ul>
              {!plan.multiclass.ok && <Check label="My table allows it anyway (house rule)" checked={ignorePrereq} onChange={setIgnorePrereq} id="lvl-ignore" />}
              {plan.training && <p className="hint">You gain: {plan.training.replace(/^.*?: /, '')}.</p>}
            </div>
          )}
        </section>

        {plan && (
          <>
            <section>
              <h3>Hit points</h3>
              <div className="seg" role="radiogroup" aria-label="Hit points">
                <button type="button" role="radio" aria-checked={hpMode === 'average'} onClick={() => setHpMode('average')}>
                  Take the average: +{plan.average}
                </button>
                <button type="button" role="radio" aria-checked={hpMode === 'roll'} onClick={() => setHpMode('roll')}>
                  Roll the d{plan.hitDie}
                </button>
              </div>
              {hpMode === 'roll' && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn small primary" onClick={roll} disabled={spinning !== null || rolled !== null}>
                    {rolled === null ? `Roll d${plan.hitDie}` : 'Rolled'}
                  </button>
                  <span className={`hit-die${spinning !== null ? ' spinning' : ''}`} aria-live="polite">
                    {spinning ?? rolled ?? '–'}
                  </span>
                  {rolled !== null && (
                    <span className="hint">
                      {rolled} {plan.conMod >= 0 ? '+' : '−'} {Math.abs(plan.conMod)} CON = <b>+{hpGain(plan, rolled)} HP</b>
                    </span>
                  )}
                </div>
              )}
              <p className="hint">
                d{plan.hitDie} average {plan.hitDie / 2 + 1}, plus your Constitution modifier ({plan.conMod >= 0 ? '+' : ''}
                {plan.conMod}), at least 1.
              </p>
            </section>

            {plan.subclassOptions && (
              <section>
                <h3>Subclass</h3>
                <p className="hint">{plan.className}s choose their subclass at this level.</p>
                <div className="choices">
                  {plan.subclassOptions.map((s) => (
                    <label key={s.id} className="choice">
                      <input type="radio" name="subclass" checked={subPick === s.id} onChange={() => setSubPick(s.id)} />
                      <span>
                        <b>{s.name}</b> <small className="hint">{s.source}</small>
                        <span className="hint clamp">{s.text.split('\n')[0]}</span>
                      </span>
                    </label>
                  ))}
                  <label className="choice">
                    <input type="radio" name="subclass" checked={subPick === 'custom'} onChange={() => setSubPick('custom')} />
                    <span>
                      <b>Another subclass</b>
                      <input className="input" placeholder="e.g. Drakewarden" value={subName} onChange={(e) => (setSubName(e.target.value), setSubPick('custom'))} aria-label="Subclass name" />
                      <span className="hint">From another book or your own rules; add its features by hand, or import them into your rules library.</span>
                    </span>
                  </label>
                  <label className="choice">
                    <input type="radio" name="subclass" checked={subPick === ''} onChange={() => setSubPick('')} />
                    <span>
                      <b>Decide later</b>
                    </span>
                  </label>
                </div>
              </section>
            )}

            {plan.asi && (
              <section>
                <h3>Ability Score Improvement or a feat</h3>
                <div className="seg" role="radiogroup" aria-label="Improvement">
                  <button type="button" role="radio" aria-checked={improve === 'asi'} onClick={() => setImprove('asi')}>
                    Raise ability scores
                  </button>
                  <button type="button" role="radio" aria-checked={improve === 'feat'} onClick={() => setImprove('feat')}>
                    Take a feat
                  </button>
                </div>
                {improve === 'asi' ? (
                  <div className="grid-2" style={{ marginTop: 8 }}>
                    <div className="seg" role="radiogroup" aria-label="Split">
                      <button type="button" role="radio" aria-checked={asiSplit === 'one'} onClick={() => setAsiSplit('one')}>
                        +2 to one
                      </button>
                      <button type="button" role="radio" aria-checked={asiSplit === 'two'} onClick={() => setAsiSplit('two')}>
                        +1 to two
                      </button>
                    </div>
                    <div className="row">
                      {abilityPicker(a1, setA1, [...ABILITIES], ABILITY_CAP, 'First ability')}
                      {asiSplit === 'two' && abilityPicker(a2, setA2, [...ABILITIES], ABILITY_CAP, 'Second ability')}
                    </div>
                    <p className="hint" style={{ gridColumn: '1 / -1', margin: 0 }}>
                      Scores can’t go above {ABILITY_CAP}.{' '}
                      {asiSplit === 'one' ? `${ABILITY_NAMES[a1]} ${c.abilities[a1]} → ${Math.min(ABILITY_CAP, c.abilities[a1] + 2)}` : `${ABILITY_NAMES[a1]} → ${Math.min(ABILITY_CAP, c.abilities[a1] + 1)}, ${ABILITY_NAMES[a2]} → ${Math.min(ABILITY_CAP, c.abilities[a2] + 1)}`}
                    </p>
                  </div>
                ) : (
                  <FeatPicker
                    feats={improvementFeats}
                    value={featId}
                    onChange={(id) => (setFeatId(id), setFeatAbility(''))}
                    ability={featAbility}
                    onAbility={setFeatAbility}
                    picker={abilityPicker}
                    cap={ABILITY_CAP}
                    custom={customFeat}
                    onCustom={setCustomFeat}
                  />
                )}
              </section>
            )}

            {plan.featPicks.map((pick) => (
              <section key={pick.feature.id}>
                <h3>{pick.feature.name}</h3>
                <select className="input" value={styles[pick.feature.id] ?? ''} onChange={(e) => setStyles({ ...styles, [pick.feature.id]: e.target.value })} aria-label={pick.feature.name}>
                  <option value="">Choose later</option>
                  {pick.options.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {featById(styles[pick.feature.id] ?? '') && <RulesText text={featById(styles[pick.feature.id])!.text} className="hint" />}
              </section>
            ))}

            {plan.epicBoon && (
              <section>
                <h3>Epic Boon</h3>
                <FeatPicker feats={boons} value={boonId} onChange={(id) => (setBoonId(id), setBoonAbility(''))} ability={boonAbility} onAbility={setBoonAbility} picker={abilityPicker} cap={BOON_CAP} />
              </section>
            )}

            {plan.skillPick && (
              <section>
                <h3>A skill from {plan.className}</h3>
                <select className="input" value={skill} onChange={(e) => setSkill(e.target.value as SkillId)} aria-label="Skill">
                  <option value="">Choose a skill…</option>
                  {SKILLS.filter((s) => plan.skillPick!.from.includes(s.id as SkillId)).map((s) => (
                    <option key={s.id} value={s.id} disabled={c.skills[s.id as SkillId] > 0}>
                      {s.name}
                      {c.skills[s.id as SkillId] > 0 ? ' (already proficient)' : ''}
                    </option>
                  ))}
                </select>
              </section>
            )}

            <section>
              <h3>
                {plan.className} {plan.classLevel} brings
              </h3>
              {plan.features.length === 0 && <p className="hint">No new features at this level{plan.subclassOptions ? ' beyond your subclass' : ''}.</p>}
              {plan.features.map((f) => (
                <details key={f.id} className="feature-preview">
                  <summary>
                    <b>{f.name}</b> {statsLine(f, plan.classLevel) && <span className="hint">· {statsLine(f, plan.classLevel).replace(/^At level \d+: /, '')}</span>}
                  </summary>
                  <RulesText text={f.text} />
                </details>
              ))}
              {(plan.spells.slots[0].join() !== plan.spells.slots[1].join() || plan.spells.pact[0].count !== plan.spells.pact[1].count || plan.spells.pact[0].level !== plan.spells.pact[1].level || plan.spells.cantrips || plan.spells.prepared) && (
                <ul className="spell-changes">
                  {plan.spells.slots[0].join() !== plan.spells.slots[1].join() && (
                    <li>
                      Spell slots: {slotText(plan.spells.slots[0])} → <b>{slotText(plan.spells.slots[1])}</b>
                    </li>
                  )}
                  {(plan.spells.pact[0].count !== plan.spells.pact[1].count || plan.spells.pact[0].level !== plan.spells.pact[1].level) && (
                    <li>
                      Pact slots: {plan.spells.pact[0].count}×{ORDINAL[plan.spells.pact[0].level] || '—'} → <b>
                        {plan.spells.pact[1].count}×{ORDINAL[plan.spells.pact[1].level]}
                      </b>
                    </li>
                  )}
                  {plan.spells.cantrips && plan.spells.cantrips[0] !== plan.spells.cantrips[1] && (
                    <li>
                      {plan.className} cantrips: {plan.spells.cantrips[0]} → <b>{plan.spells.cantrips[1]}</b>
                    </li>
                  )}
                  {plan.spells.prepared && plan.spells.prepared[0] !== plan.spells.prepared[1] && (
                    <li>
                      {plan.className} prepared spells: {plan.spells.prepared[0]} → <b>{plan.spells.prepared[1]}</b>
                    </li>
                  )}
                </ul>
              )}
              <p className="hint">Proficiency Bonus, spell slots, cantrip damage, saves, skills and everything else on the sheet update on their own.</p>
            </section>
          </>
        )}

        <div className="row levelup-actions">
          {blockers.length > 0 && <span className="hint">{blockers[0]}</span>}
          <button type="button" className="btn primary" disabled={blockers.length > 0} onClick={confirm}>
            {plan ? `Level up to ${plan.totalLevel}` : 'Level up'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function FeatPicker(props: {
  feats: FeatDef[];
  value: string;
  onChange: (id: string) => void;
  ability: Ability | '';
  onAbility: (a: Ability) => void;
  picker: (value: Ability | '', set: (a: Ability) => void, options: Ability[], cap: number, label: string) => React.JSX.Element;
  cap: number;
  custom?: string;
  onCustom?: (s: string) => void;
}) {
  const feat = props.feats.find((f) => f.id === props.value);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
      <select className="input" value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label="Feat">
        <option value="">{props.onCustom ? 'Choose a feat, or type one below…' : 'Choose…'}</option>
        {props.feats.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
            {f.source && f.source !== 'SRD 5.2.1' ? ` (${f.source})` : ''}
          </option>
        ))}
      </select>
      {feat && feat.abilities.length > 0 && props.picker(props.ability, props.onAbility, feat.abilities, props.cap, `${feat.name} raises`)}
      {feat && <RulesText text={feat.text} className="hint" />}
      {props.onCustom && !feat && (
        <input className="input" placeholder="Another feat, by name (e.g. Sharpshooter)" value={props.custom ?? ''} onChange={(e) => props.onCustom!(e.target.value)} aria-label="Feat name" />
      )}
    </div>
  );
}
