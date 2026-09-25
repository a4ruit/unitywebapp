// roles.js — the four player roles, and the pixel symbols that stand for them.
//
// A role is a CLAIM, not a constraint: nothing is locked behind it, nothing is
// forbidden by it. It exists so a player can say "I'm the healer" in one tap,
// so the room can read at a glance what the pack is made of, and — the reason
// it was built — so that a symbol can appear over their name tag on the
// projection the moment they act, and make it obvious who just did that.
//
// The grids here are the SAME art the Unity side draws. Keeping them as strings
// rather than PNGs means one definition, no import step, and a symbol that
// stays crisp at any size on either runtime.

const Roles = (() => {

  // 11x11, odd so every symbol has a true centre column. Small enough to read
  // across a room at 2-3x, big enough for a cross and a sword to differ.
  //   . = empty   O = outline   F = fill   H = highlight
  const ART = {
    tank: [
      '...........',
      '..OOOOOOO..',
      '.OFFFFFFFO.',
      '.OFHHHHHFO.',
      '.OFFFFFFFO.',
      '.OFFFFFFFO.',
      '..OFFFFFO..',
      '..OFFFFFO..',
      '...OFFFO...',
      '....OFO....',
      '.....O.....',
    ],
    medic: [
      '...........',
      '...OOOOO...',
      '...OFFFO...',
      '.OOOFFFOOO.',
      '.OFFFFFFFO.',
      '.OFFFHFFFO.',
      '.OFFFFFFFO.',
      '.OOOFFFOOO.',
      '...OFFFO...',
      '...OOOOO...',
      '...........',
    ],
    damage: [
      '...........',
      '..H.....H..',
      '...H...H...',
      '....H.H....',
      '.....H.....',
      '....H.H....',
      '...H...H...',
      '..H.....H..',
      '.FF.....FF.',
      '.F.......F.',
      '...........',
    ],
    saboteur: [
      '.....O.....',
      '....OFO....',
      '....OFFO.O.',
      '...OFFFFO..',
      '..OFFFFFFO.',
      '..OFFHHFFO.',
      '.OFFHHHHFO.',
      '.OFHHHHHFO.',
      '.OFHHHHHFO.',
      '..OFHHHFO..',
      '...OOOOO...',
    ],
  };

  const META = {
    tank:     { label: 'TANK',     hint: 'soak it'   },
    medic:    { label: 'MEDIC',    hint: 'mend it'   },
    damage:   { label: 'DAMAGE',   hint: 'break it'  },
    saboteur: { label: 'SABOTEUR', hint: 'burn it'   },
  };

  const ORDER = ['tank', 'medic', 'damage', 'saboteur'];

  function list() { return ORDER.slice(); }
  function meta(id) { return META[id] || META.saboteur; }
  function art(id)  { return ART[id]  || ART.saboteur; }

  // Draws one symbol into a canvas, in the player's own colour. The outline is
  // near-black and the highlight near-white, so the symbol survives being drawn
  // over grass, over the boss's glitch, or over a white flash.
  function draw(ctx, id, x, y, px, colour) {
    const grid = art(id);
    const fill = colour || '#ffffff';
    const line = '#0a0a12';
    const hi   = '#ffffff';

    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'O' ? line : (ch === 'H' ? hi : fill);
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }

  // A standalone canvas of one symbol, for buttons and the keepsake poster.
  function canvas(id, px, colour) {
    const grid = art(id);
    const c = document.createElement('canvas');
    c.width  = grid[0].length * px;
    c.height = grid.length * px;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    draw(g, id, 0, 0, px, colour);
    return c;
  }

  return { list, meta, art, draw, canvas, size: 11 };
})();
