const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf-8');

// Insert import at the top
content = "import BookingInterface from './components/BookingInterface';\n" + content;

// Find the end of the App component
const match = content.match(/return <BookingInterface[\s\S]*?};\n/);
if (match) {
    const cutoff = match.index + match[0].length;
    content = content.substring(0, cutoff) + "\nexport default App;\n";
    fs.writeFileSync('src/App.jsx', content, 'utf-8');
    console.log("Successfully pruned App.jsx");
} else {
    console.log("Could not find end of App component");
}
