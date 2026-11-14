// The Species library: the free rules' nine species with their lineages, and Aasimar, to read
// and to take onto the sheet; and mixed heritage, any two of them (Aasimar–Drow, a Half-Elf…),
// by the 2024 rule (one side's traits, both looks) or as a homebrew blend.

import { useMemo, useState } from 'react';
import { useCatalog } from '../state/catalog';
import { useChar } from '../state/character';
import { ABILITY_NAMES, type Ability } from '../systems/dnd5e/data';
import type { SpeciesPick } from '../systems/dnd5e/model';
import { applyHeritage, blendBalance, findLineage, findSpecies, heritageName, heritageSpells, heritageStats, partName, sideTraits } from '../systems/dnd5e/species';
import type { SpeciesDef } from '../systems/dnd5e/srd';
import { emblemSvg, mixedEmblemSvg, svgDataUrl } from './emblems';
import { RulesText } from './RulesText';
import { ConfirmButton, Panel } from './ui';

const CASTING: Ability[] = ['int', 'wis', 'cha'];

/** A crest, drawn inline. */
function Crest({ svg, size = 56 }: { svg: string; size?: number }) {
  return <span className="crest" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function SpeciesLibraryPanel() {
  const cat = useCatalog();
  const { char: c } = useChar();
  const [open, setOpen] = useState<string | null>(null);
  const [mixing, setMixing] = useState(false);
  if (!cat?.species?.length)
    return (
      <Panel title="Species" tab="library">
        <p className="hint">Loading the rules…</p>
      </Panel>
    );
  return (
    <Panel
      title="Species"
      tab="library"
      actions={
        <button type="button" className="btn small" onClick={() => setMixing((v) => !v)} aria-expanded={mixing}>
          {mixing ? 'Close mixed heritage' : 'Mixed heritage'}
        </button>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        The free rules’ nine species (SRD 5.2.1) with their lineages, and Aasimar (Player’s Handbook, 2024). Taking one puts its traits, spells, Speed and size on your sheet, in place of
        your current species’. Yours: <b>{c.species || 'not set'}</b>
        {c.speciesPick ? '' : c.species ? ' (typed in)' : ''}.
      </p>
      {mixing && <MixedHeritage onDone={() => setMixing(false)} />}
      <div className="list">
        {cat.species.map((sp) => (
          <SpeciesCard key={sp.id} sp={sp} open={open === sp.id} onToggle={() => setOpen(open === sp.id ? null : sp.id)} />
        ))}
      </div>
    </Panel>
  );
}

/** Lineage, size and spellcasting choices for one side. */
function Choices(props: { sp: SpeciesDef; lineage: string; setLineage: (v: string) => void; size?: string; setSize?: (v: string) => void; label?: string }) {
  const { sp } = props;
  return (
    <>
      {sp.lineages.length > 0 && (
        <select className="input" value={props.lineage} onChange={(e) => props.setLineage(e.target.value)} aria-label={`${props.label ?? sp.name}: ${sp.lineageLabel}`}>
          <option value="" disabled>
            {sp.lineageLabel}…
          </option>
          {sp.lineages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      {props.setSize && sp.size === 'Medium or Small' && (
        <select className="input" value={props.size} onChange={(e) => props.setSize!(e.target.value)} aria-label={`${props.label ?? sp.name}: size`}>
          <option value="Medium">Medium</option>
          <option value="Small">Small</option>
        </select>
      )}
    </>
  );
}

function SpeciesCard({ sp, open, onToggle }: { sp: SpeciesDef; open: boolean; onToggle: () => void }) {
  const cat = useCatalog()!;
  const { char: c, update } = useChar();
  const [lineage, setLineage] = useState('');
  const [size, setSize] = useState('Medium');
  const [ability, setAbility] = useState<Ability>('cha');
  const [msg, setMsg] = useState('');
  const pick: SpeciesPick = { a: { species: sp.id, lineage }, b: null, rules: 'a', traits: [], ability, size, name: '' };
  const needsLineage = sp.lineages.length > 0 && !lineage;
  const castsSpells = heritageSpells(cat, pick, 20).some((s) => s.ability === ability && s.name !== 'Light');
  const lin = findLineage(sp, lineage);
  return (
    <div className="item species-card">
      <div className="item-head">
        <button type="button" className="item-title species-title" onClick={onToggle} aria-expanded={open}>
          <Crest svg={emblemSvg(sp.id, lineage, sp.name)} size={44} />
          <span>
            <b>{sp.name}</b>
            <small>
              {sp.size} · Speed {sp.speed} ft.{sp.darkvision ? ` · Darkvision ${sp.darkvision} ft.` : ''}
              {sp.lineages.length ? ` · ${sp.lineages.length} ${sp.lineageLabel.replace(/^\w+ /, '').toLowerCase().replace(/y$/, 'ie')}s` : ''}
              {sp.source !== 'SRD 5.2.1' ? ` · ${sp.source}` : ''}
            </small>
          </span>
        </button>
      </div>
      {open && (
        <div className="item-body">
          {sp.source === 'SRD 5.2.1' ? <RulesText text={sp.description} /> : sp.traits.map((t) => <RulesText key={t.key} text={`***${t.name}.*** ${t.text}`} />)}
          {lin && <RulesText text={`***${lin.name}.*** ${lin.text}`} />}
          <div className="row">
            <Choices sp={sp} lineage={lineage} setLineage={setLineage} size={size} setSize={setSize} />
            {castsSpells && (
              <select className="input" value={ability} onChange={(e) => setAbility(e.target.value as Ability)} aria-label="Spellcasting ability for its spells">
                {CASTING.map((a) => (
                  <option key={a} value={a}>
                    Spells use {ABILITY_NAMES[a]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="row">
            <ConfirmButton
              label={needsLineage ? `Choose a ${sp.lineageLabel.toLowerCase()} first` : `Take ${partName(sp, lin)} as my species`}
              confirmLabel={c.species ? `Replace ${c.species}’s traits?` : 'Take it?'}
              className="btn small primary"
              onConfirm={() => {
                if (needsLineage) return;
                update((d) => applyHeritage(d, cat, pick));
                setMsg(`${partName(sp, lin)} is your species: its traits are under Features & traits${heritageSpells(cat, pick, 20).length ? ', its spells under Spellcasting' : ''}.`);
              }}
            />
          </div>
          {msg && (
            <p className="hint" role="status">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Two species (and lineages), whose traits, a name, and both pictures. */
function MixedHeritage({ onDone }: { onDone: () => void }) {
  const cat = useCatalog()!;
  const { char: c, update } = useChar();
  const species = cat.species ?? [];
  const [a, setA] = useState({ species: 'aasimar', lineage: '' });
  const [b, setB] = useState({ species: 'elf', lineage: 'drow' });
  const [rules, setRules] = useState<SpeciesPick['rules']>('a');
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [name, setName] = useState('');
  const [ability, setAbility] = useState<Ability>('cha');
  const [size, setSize] = useState('Medium');
  const spA = findSpecies(cat, a.species);
  const spB = findSpecies(cat, b.species);
  const base: SpeciesPick = { a, b, rules, traits: [], ability, size, name: name.trim() };
  const offered = sideTraits(cat, base);
  // A blend starts from the first side's traits.
  const traits = chosen ?? offered.filter((t) => t.side === 'a').map((t) => t.key);
  const pick: SpeciesPick = { ...base, traits };
  const stats = useMemo(() => heritageStats(cat, pick), [cat, JSON.stringify(pick)]); // eslint-disable-line react-hooks/exhaustive-deps
  const balance = blendBalance(cat, pick);
  const auto = heritageName(cat, { ...pick, name: '' });
  const nameA = partName(spA, findLineage(spA, a.lineage));
  const nameB = partName(spB, findLineage(spB, b.lineage));
  const missingLineage = (spA?.lineages.length && !a.lineage) || (spB?.lineages.length && !b.lineage);
  const crest = mixedEmblemSvg(a, b, stats.name, 'mix');
  const casts = heritageSpells(cat, pick, 20).some((s) => s.ability === ability && s.name !== 'Light');
  const side = (label: string, v: typeof a, set: (x: typeof a) => void) => {
    const sp = findSpecies(cat, v.species);
    return (
      <div className="mix-side">
        <span className="hint">{label}</span>
        <select className="input" value={v.species} onChange={(e) => (set({ species: e.target.value, lineage: '' }), setChosen(null))} aria-label={`${label}: species`}>
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {sp && <Choices sp={sp} lineage={v.lineage} setLineage={(l) => (set({ ...v, lineage: l }), setChosen(null))} label={label} />}
        {sp && <Crest svg={emblemSvg(v.species, v.lineage, partName(sp, findLineage(sp, v.lineage)))} size={64} />}
      </div>
    );
  };
  return (
    <section className="mixed-heritage" aria-label="Mixed heritage">
      <h4>Mixed heritage</h4>
      <p className="hint" style={{ margin: 0 }}>
        Half one, half the other. By the 2024 rules a character of mixed heritage uses one species’ game traits and can look like both. A blend of traits from both is homebrew: check
        it with your DM.
      </p>
      <div className="mix-sides">
        {side('One side', a, setA)}
        <Crest svg={crest} size={92} />
        {side('The other side', b, setB)}
      </div>
      <div className="seg wrap" role="radiogroup" aria-label="Whose traits">
        <button type="button" role="radio" aria-checked={rules === 'a'} onClick={() => setRules('a')}>
          {nameA}’s traits
        </button>
        <button type="button" role="radio" aria-checked={rules === 'b'} onClick={() => setRules('b')}>
          {nameB}’s traits
        </button>
        <button type="button" role="radio" aria-checked={rules === 'blend'} onClick={() => setRules('blend')}>
          Blend (homebrew)
        </button>
      </div>
      {rules === 'blend' && (
        <div className="blend">
          {(['a', 'b'] as const).map((s) => (
            <fieldset key={s} className="fieldset">
              <legend>{s === 'a' ? nameA : nameB}</legend>
              {offered
                .filter((t) => t.side === s)
                .map((t) => (
                  <label key={t.key} className="check" title={t.trait.text}>
                    <input type="checkbox" checked={traits.includes(t.key)} onChange={(e) => setChosen(e.target.checked ? [...traits, t.key] : traits.filter((k) => k !== t.key))} />
                    {t.trait.name}
                  </label>
                ))}
            </fieldset>
          ))}
          <p className="hint" style={{ margin: 0, color: balance.over ? 'var(--warn)' : undefined }}>
            {balance.taken} traits; one species has up to {balance.usual}.{balance.over ? ' That’s more than either species gets: your DM may want you to drop some.' : ''}
          </p>
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>
        {stats.size} · Speed {stats.speed} ft.{stats.darkvision ? ` · Darkvision ${stats.darkvision} ft.` : ''} · {stats.traits.map((t) => t.trait.name).join(', ')}
      </p>
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={name} placeholder={auto} onChange={(e) => setName(e.target.value.slice(0, 80))} aria-label="Name for this heritage" />
        {casts && (
          <select className="input" style={{ width: 'auto' }} value={ability} onChange={(e) => setAbility(e.target.value as Ability)} aria-label="Spellcasting ability for its spells">
            {CASTING.map((x) => (
              <option key={x} value={x}>
                Spells use {ABILITY_NAMES[x]}
              </option>
            ))}
          </select>
        )}
        {findSpecies(cat, (rules === 'b' ? b : a).species)?.size === 'Medium or Small' && (
          <select className="input" style={{ width: 'auto' }} value={size} onChange={(e) => setSize(e.target.value)} aria-label="Size">
            <option value="Medium">Medium</option>
            <option value="Small">Small</option>
          </select>
        )}
      </div>
      <div className="row">
        <ConfirmButton
          label={missingLineage ? 'Choose the lineages first' : `Take ${stats.name} as my species`}
          confirmLabel={c.species ? `Replace ${c.species}’s traits?` : 'Take it?'}
          className="btn small primary"
          onConfirm={() => {
            if (missingLineage) return;
            update((d) => applyHeritage(d, cat, pick));
            onDone();
          }}
        />
        <button type="button" className="btn small ghost" onClick={() => update((d) => void (d.portrait = svgDataUrl(crest)))} title="Use this crest as your character’s picture">
          Use the crest as my portrait
        </button>
      </div>
    </section>
  );
}
