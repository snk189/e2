const fs = require('fs');

let text = fs.readFileSync('src/components/BookingInterface.jsx', 'utf-8');

text = text.replace(/\\{\\\\ g-orb/g, '"bg-orb');
text = text.replace(/\\{\\\\w-1\\.5/g, '"w-1.5');
text = text.replace(/\\{\\\\method-slider/g, '"method-slider');

text = text.replace(/className=\\{\\\\?n?elative z-10 flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 active:scale-95 \\\\\\}/g, 'className="relative z-10 flex-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-2 active:scale-95 "');

text = text.replace(/className=\\{\\\\ultra-pro-slide pt-\\[190px\\] pb-44 overflow-y-auto \\nno-scrollbar \\\\\\}/g, 'className="ultra-pro-slide pt-[190px] pb-44 overflow-y-auto no-scrollbar "');
text = text.replace(/style=\\{\\{ color: \\\\ ar\\(--color-\\\\\\)\\\\\\} \\}\\}/g, 'style={{ color: `var(--color-${categoryStyles[category]?.tone || "main"})` }}');
text = text.replace(/href=\\{\\\\#cat-\\\\\\\}/g, 'href={`#cat-${categoryStyles[category]?.id}`}');
text = text.replace(/id=\\{\\\\cat-\\\\\\\}/g, 'id={`cat-${categoryStyles[category]?.id}`}');
text = text.replace(/className=\\{\\\\ bsolute bottom-0 left-4 right-4 h-0\\.5 rounded-full opacity-80 ultra-pro-header gradient-\\\\\\\}/g, 'className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full opacity-80 ultra-pro-header gradient-"');

text = text.replace(/className=\\{\\\\ultra-pro-header gradient-\\\\ font-black uppercase tracking-\\[0\\.15em\\] text-white px-5 rounded-full text-sm py-2\\\\\\}/g, 'className={`ultra-pro-header gradient-${categoryStyles[category]?.tone || "main"} font-black uppercase tracking-[0.15em] text-white px-5 rounded-full text-sm py-2`}');

text = text.replace(/className=\\{\\\\ultra-pro-slide pt-\\[190px\\] pb-24 overflow-y-auto \\nno-scrollbar pointer-events-none \\\\\\}/g, 'className="ultra-pro-slide pt-[190px] pb-24 overflow-y-auto no-scrollbar pointer-events-none"');
text = text.replace(/\\{\\\\w-24/g, '"w-24');
text = text.replace(/\\{\\x0cont-display-lg/g, '"font-display-lg');
text = text.replace(/\\{\\text-sm/g, '"text-sm');
text = text.replace(/\\{\\t/g, '"t'); // fallback for text-sm if the above fails
text = text.replace(/\\{\\\\mt-4/g, '"mt-4');
text = text.replace(/\\{\\x0cixed/g, '"fixed');
text = text.replace(/\\{\\\\nrelative z-20/g, '"relative z-20');
text = text.replace(/\\\\t/g, 't'); // fix translate3d
text = text.replace(/transform: \\\\	ranslate3d\\(\\\\px, 0, 0\\\\\\),/g, 'transform: `translate3d(${slideX}px, 0, 0)`,');

text = text.replace(/ \\\\\\}/g, '"');
text = text.replace(/\\\\\\}/g, '"');

// Additional exact replacements from earlier
text = text.replace(/className=\\{\\x0cixed/g, 'className="fixed');
text = text.replace(/className=\\{\\x0cont-display-lg/g, 'className="font-display-lg');
text = text.replace(/className=\\{\\text-sm/g, 'className="text-sm');
text = text.replace(/className=\\{\\t/g, 'className="t');

fs.writeFileSync('src/components/BookingInterface.jsx', text, 'utf-8');
console.log('Fixed syntax errors in BookingInterface.jsx via Node script');
