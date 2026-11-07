// The pages (a phone's tabs): rename them, put them in your order, add your own (for
// homebrew rules or another game), and delete the ones you made. Tiles you removed are
// listed here to add back.

import { useState } from 'react';
import { addPage, deletePage, movePage, renamePage, type Layout, type PanelKey } from '../state/layout';
import { ConfirmButton, Dialog } from './ui';

export function PagesDialog(props: {
  layout: Layout;
  setLayout: (l: Layout) => void;
  onClose: () => void;
  onOpen: (pageId: string) => void;
  exists: (k: string) => boolean;
  /** Tiles taken off the sheet, to add back. */
  removed: { id: PanelKey; name: string }[];
  onAddBack: (id: PanelKey) => void;
}) {
  const { layout, setLayout } = props;
  const [name, setName] = useState('');
  return (
    <Dialog title="Pages" onClose={props.onClose}>
      <p className="hint" style={{ marginTop: 0 }}>
        Pages are the tabs on a phone. Pages you add also get a tab beside “Character sheet” on wider screens. Move tiles onto a page with the “On:” chooser on each tile while arranging.
      </p>
      <div className="list">
        {layout.pages.map((p, i) => {
          const count = p.panels.filter(props.exists).length;
          return (
            <div key={p.id} className="item page-row">
              <input className="input" value={p.name} aria-label={`Name of the ${p.name} page`} onChange={(e) => setLayout(renamePage(layout, p.id, e.target.value))} onBlur={(e) => !e.target.value.trim() && setLayout(renamePage(layout, p.id, 'Page'))} />
              <span className="hint">{count} tile{count === 1 ? '' : 's'}</span>
              <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button type="button" className="btn small ghost" aria-label={`Move ${p.name} earlier`} disabled={i === 0} onClick={() => setLayout(movePage(layout, p.id, -1))}>
                  ↑
                </button>
                <button type="button" className="btn small ghost" aria-label={`Move ${p.name} later`} disabled={i === layout.pages.length - 1} onClick={() => setLayout(movePage(layout, p.id, 1))}>
                  ↓
                </button>
                <button type="button" className="btn small ghost" onClick={() => (props.onOpen(p.id), props.onClose())}>
                  Open
                </button>
                {p.custom && <ConfirmButton label="Delete" confirmLabel="Delete page" onConfirm={() => setLayout(deletePage(layout, p.id))} />}
              </span>
            </div>
          );
        })}
      </div>
      <form
        className="row"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          const [next, id] = addPage(layout, name || 'New page');
          setLayout(next);
          setName('');
          props.onOpen(id);
        }}
      >
        <input className="input" style={{ flex: 1, minWidth: 0 }} value={name} placeholder="New page: Homebrew, Sanity, Ship…" aria-label="Name of a new page" id="new-page-name" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn small primary">
          Add page
        </button>
      </form>
      <p className="hint">Deleting a page you made doesn’t delete its tiles: they move back to another page.</p>
      <h3 style={{ margin: '14px 0 6px' }}>Removed tiles</h3>
      {props.removed.length ? (
        <div className="list">
          {props.removed.map((x) => (
            <div key={x.id} className="item page-row">
              <b>{x.name}</b>
              <span className="hint">Not on any page</span>
              <button type="button" className="btn small" onClick={() => props.onAddBack(x.id)}>
                Add back
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: 0 }}>
          None. To take a tile off your pages, tap Arrange, then Remove on that tile. Nothing in it is deleted, and it comes back here to add again.
        </p>
      )}
    </Dialog>
  );
}
