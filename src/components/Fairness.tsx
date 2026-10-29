import { useState } from 'react';
import { checkDie, hitChance, type FaceCheck } from '../engine/fairness';
import { NumField } from './ui';

const DICE = [4, 6, 8, 10, 12, 20, 100];
const COUNTS = [10_000, 100_000, 1_000_000];
const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

/**
 * Lets anyone check the dice for themselves: roll a die thousands of times with the same
 * roller the sheet uses, see how often each face came up, and read a chi-square verdict.
 * Also shows what a bonus actually buys against an AC, since "I always hit" is usually
 * about the odds, not the dice.
 */
export function FairnessCheck() {
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(100_000);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FaceCheck | null>(null);
  const [bonus, setBonus] = useState(7);
  const [ac, setAc] = useState(15);

  const run = () => {
    setBusy(true);
    // Let the button show its busy state before the (brief) burst of rolling.
    setTimeout(() => {
      setResult(checkDie(sides, count));
      setBusy(false);
    }, 30);
  };

  const max = result ? Math.max(...result.counts) : 1;
  return (
    <div className="fairness">
      <p className="hint" style={{ margin: 0 }}>
        Every roll uses your device’s cryptographic random generator (the one browsers use for security keys), and rolls are drawn so no face is favoured. Nothing in the
        app picks or nudges a result. Check it yourself:
      </p>
      <div className="row">
        <select className="input" style={{ width: 'auto' }} value={sides} aria-label="Die" onChange={(e) => setSides(Number(e.target.value))}>
          {DICE.map((d) => (
            <option key={d} value={d}>
              d{d}
            </option>
          ))}
        </select>
        <select className="input" style={{ width: 'auto' }} value={count} aria-label="Number of rolls" onChange={(e) => setCount(Number(e.target.value))}>
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()} rolls
            </option>
          ))}
        </select>
        <button type="button" className="btn small" onClick={run} disabled={busy}>
          {busy ? 'Rolling…' : 'Roll and check'}
        </button>
      </div>
      {result && (
        <div className="fair-result" aria-live="polite">
          <div className="histogram" role="img" aria-label={`How often each face of a d${result.sides} came up`}>
            {result.counts.map((n, i) => (
              <span key={i} style={{ height: `${(n / max) * 100}%` }} title={`${i + 1}: ${n.toLocaleString()}`} />
            ))}
            <i style={{ bottom: `${(result.expected / max) * 100}%` }} aria-hidden="true" />
          </div>
          <p className="hint" style={{ margin: 0 }}>
            <b className={result.fair ? 'good' : 'bad'}>{result.fair ? 'Consistent with a fair die.' : 'Unusually uneven for a fair die.'}</b> {result.rolls.toLocaleString()} rolls,
            average {result.mean.toFixed(3)} (a fair d{result.sides} averages {result.expectedMean}). The most-off face was {result.worstDeviation.toFixed(1)}% from its fair share.
            Chi-square {result.chiSquare.toFixed(1)} on {result.degreesOfFreedom} degrees of freedom, p = {result.pValue < 0.0001 ? result.pValue.toExponential(1) : result.pValue.toFixed(3)}.
          </p>
          <p className="hint" style={{ margin: 0 }}>
            The p-value is the chance a perfectly fair die would look at least this uneven by luck. Fair dice give p anywhere from 0 to 1 (run it a few times and it moves around);
            only a value below 0.001 would hint at a bias, and even fair dice land there once in a thousand runs.
          </p>
        </div>
      )}
      <h4 style={{ margin: '8px 0 0' }}>How often should I hit?</h4>
      <div className="row">
        <NumField label="Attack bonus" id="fair-bonus" value={bonus} min={-5} max={30} onChange={setBonus} />
        <NumField label="Target AC" id="fair-ac" value={ac} min={1} max={40} onChange={setAc} />
      </div>
      <p className="hint" style={{ margin: 0 }}>
        +{bonus} against AC {ac} hits <b>{pct(hitChance(bonus, ac))}</b> of the time ({pct(hitChance(bonus, ac, 'adv'))} with Advantage, {pct(hitChance(bonus, ac, 'dis'))} with
        Disadvantage). Of the 330 creatures in the core rules (SRD 5.2.1), 9 in 10 have AC 10 to 19 and the median is AC 14, so a good attack bonus really does land most turns. With no Target AC set (Combat panel), the sheet can’t
        tell whether you hit, so it shows <i>HIT?</i> and lets your DM decide.
      </p>
    </div>
  );
}
