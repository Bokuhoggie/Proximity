// Curated emoji set for the picker. Friends-only chat — no need for the
// full ~3000 unicode emoji catalog. Just a couple hundred common ones
// grouped into a handful of categories.

export const EMOJI_CATEGORIES = [
    {
        label: 'Smileys', emojis: [
            '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
            '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥',
            '😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓',
            '🧐','😕','😟','🙁','☹','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣',
            '😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👹','👺','👻','👽','🤖'
        ]
    },
    {
        label: 'Hands & people', emojis: [
            '👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝','👍',
            '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠',
            '🫀','🫁','🦷','🦴','👀','👁','👅','👄','💋','🩸'
        ]
    },
    {
        label: 'Hearts & symbols', emojis: [
            '❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮',
            '✝','☪','🕉','☸','✡','🔯','🕎','☯','☦','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐',
            '♑','♒','♓','🆔','⚛','✨','💫','⭐','🌟','💥','💢','💯','💦','💨','🕳','💣','💬','👁‍🗨','🗨','🗯','💭'
        ]
    },
    {
        label: 'Animals & nature', emojis: [
            '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒',
            '🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗',
            '🕷','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🌵','🌲',
            '🌳','🌴','🌱','🌿','☘','🍀','🍁','🍂','🍃','🌷','🌹','🥀','🌺','🌸','🌼','🌻'
        ]
    },
    {
        label: 'Food & drink', emojis: [
            '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑',
            '🥦','🥬','🥒','🌶','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳',
            '🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🍿','🍱',
            '🍣','🍤','🍙','🍚','🍘','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪',
            '☕','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧋','🧃','🧉','🧊'
        ]
    },
    {
        label: 'Activity & objects', emojis: [
            '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🥅','⛳','🏹','🎣','🥊','🥋','🎽',
            '🛹','🛷','⛸','🥌','🎿','⛷','🏂','🏋','🤼','🤸','⛹','🤺','🤾','🏌','🏇','🧘','🏄','🏊','🤽','🚣',
            '🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧',
            '🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','♟','🎯','🎳','🎮','🎰','🧩','💻','🖥','🖨','⌨','🖱',
            '🖲','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽','🎞','📞','☎','📟','📠','📺','📻','🎙','🎚',
            '🎛','⏱','⏲','⏰','🕰','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯','🪔','🧯','🛢','💸','💵','💴','💶'
        ]
    },
    {
        label: 'Travel & places', emojis: [
            '🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🦯','🦽','🦼','🛴','🚲','🛵',
            '🏍','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇',
            '🚊','🚉','✈','🛫','🛬','🛩','💺','🛰','🚀','🛸','🚁','🛶','⛵','🚤','🛥','🛳','⛴','🚢','⚓','⛽',
            '🚧','🚦','🚥','🚏','🗺','🗿','🗽','🗼','🏰','🏯','🏟','🎡','🎢','🎠','⛲','⛱','🏖','🏝','🏜','🌋',
            '⛰','🏔','🗻','🏕','⛺','🛖','🏠','🏡','🏘','🏚','🏗','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪',
            '🏫','🏩','💒','🏛','⛪','🕌','🕍','🛕','🕋','⛩'
        ]
    },
    {
        label: 'Flags & misc', emojis: [
            '🚩','🏁','🏴','🏳','🏳‍🌈','🏳‍⚧','🏴‍☠','🇺🇸','🇨🇦','🇲🇽','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇧🇷',
            '🇦🇺','🇷🇺','🆗','🆒','🆕','🆓','🆙','🆖','🆗','🆘','🛑','⛔','📛','🚫','💯','💢','♨','🚷','🚯','🚳',
            '🚱','🔞','📵','🚭','❗','❕','❓','❔','‼','⁉','🔅','🔆','〽','⚠','🚸','🔱','⚜','🔰','♻','✅',
            '🈯','💹','❇','✳','❎','🌐','💠','Ⓜ','🌀','💤','🏧','🚾','♿','🅿','🛗','🛂','🛃','🛄','🛅'
        ]
    }
];

let openPicker = null;

// Open a popover anchored to the trigger element with onPick(emoji) callback.
// Returns a close fn. Closes on outside click, Esc, or another open call.
export function openEmojiPicker(triggerEl, onPick) {
    if (openPicker) openPicker.close();

    const panel = document.createElement('div');
    panel.className = 'emoji-panel';

    const tabs = document.createElement('div');
    tabs.className = 'emoji-tabs';
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';

    const buttons = [];
    EMOJI_CATEGORIES.forEach((cat, idx) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'emoji-tab';
        tab.title = cat.label;
        tab.textContent = cat.emojis[0];
        tab.addEventListener('click', () => showCategory(idx));
        tabs.append(tab);
        buttons.push(tab);
    });

    function showCategory(idx) {
        buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
        grid.innerHTML = '';
        for (const e of EMOJI_CATEGORIES[idx].emojis) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emoji-btn';
            b.textContent = e;
            b.addEventListener('click', () => onPick(e));
            grid.append(b);
        }
    }

    panel.append(tabs, grid);
    document.body.append(panel);

    // Position above the trigger, anchored to its right edge.
    const rect = triggerEl.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    panel.style.right = (window.innerWidth - rect.right) + 'px';

    showCategory(0);

    const close = () => {
        panel.remove();
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey);
        openPicker = null;
    };
    const onOutside = (e) => {
        if (!panel.contains(e.target) && e.target !== triggerEl) close();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => {
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('keydown', onKey);
    }, 0);

    openPicker = { close };
    return close;
}
