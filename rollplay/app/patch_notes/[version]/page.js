import fs from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';

// This runs at build time and fetches the markdown
async function getPatchNotes(version) {
  // Look for patch notes in the rollplay app directory
  const filePath = path.join(process.cwd(), 'patch_notes', `${version}.md`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error(`Could not find patch notes for version ${version}:`, error.message);
    return null; // File not found
  }
}

export default async function PatchNotesPage({ params }) {
  const { version } = await params;
  const content = await getPatchNotes(version);

  if (!content) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white">
        <div className="w-4/5 mx-auto p-8">
          <div className="text-center py-20">
            <h1 className="text-4xl font-bold text-red-400 mb-4">📝 Patch Notes Not Found</h1>
            <p className="text-gray-300 text-lg mb-6">Version {version} patch notes don't exist.</p>
            <a 
              href="/game" 
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              🎲 Back to Game
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white">
      <div className="w-4/5 mx-auto p-8 max-w-screen-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <a 
            href="/patch_notes" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors mb-4"
          >
            ← Back to Patch Notes
          </a>
        </div>

        {/* Markdown Content */}
        <div className="bg-slate-800/200 backdrop-blur-m rounded-xl p-8 shadow-2xl border border-blue-500/20 prose prose-invert prose-lg max-w-none">
          <ReactMarkdown 
            components={{
              // Headers
              h1: ({children}) => (
                <h1 className="text-4xl font-bold mb-8 text-center border-b border-blue-500/30 pb-4">
                  {children}
                </h1>
              ),
              h2: ({children}) => (
                <h2 className="text-2xl font-bold mt-12 mb-6">
                  {children}
                </h2>
              ),
              h3: ({children}) => (
                <h3 className="text-xl font-bold mt-8 mb-4">
                  {children}
                </h3>
              ),
              h4: ({children}) => (
                <h4 className="text-lg font-bold mt-6 mb-3">
                  {children}
                </h4>
              ),
              
              // Text formatting
              strong: ({children}) => <strong className="font-bold">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              
              // Code
              code: ({children}) => (
                <code className="bg-slate-900 rounded text-blue-400 font-mono text-sm">
                  {children}
                </code>
              ),
              pre: ({children}) => (
                <pre className="bg-slate-900 p-4 rounded-lg overflow-x-auto border border-slate-700 my-4">
                  {children}
                </pre>
              ),
              
              // Lists
              ul: ({children}) => (
                <ul className="list-none ml-0 space-y-1 my-2">
                  {children}
                </ul>
              ),
              ol: ({children}) => (
                <ol className="list-decimal ml-6 space-y-2 my-4 text-gray-300">
                  {children}
                </ol>
              ),
              li: ({children}) => (
                <li className="text-gray-300 flex items-start">
                  <span className="text-blue-400 mr-2 mt-1">•</span>
                  <span>{children}</span>
                </li>
              ),
              
              // Paragraphs and text
              p: ({children}) => (
                <p className="text-gray-300 leading-relaxed my-4">
                  {children}
                </p>
              ),
              
              // Links
              a: ({href, children}) => (
                <a 
                  href={href} 
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              
              // Horizontal rule
              hr: () => (
                <hr className="border-blue-500/30 my-8" />
              ),
              
              // Blockquotes
              blockquote: ({children}) => (
                <blockquote className="border-l-4 border-blue-500 pl-4 my-4 italic text-blue-200 bg-blue-900/20 py-2">
                  {children}
                </blockquote>
              )
            }}
          >
            {content}
          </ReactMarkdown>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-400">
          <p>🎲 Tabletop Tavern • Version {version}</p>
        </div>
      </div>
    </div>
  );
}

// Generate static params for known versions (for better performance)
export async function generateStaticParams() {
  const patchNotesDir = path.join(process.cwd(), 'patch_notes');
  
  try {
    const files = fs.readdirSync(patchNotesDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => ({
        version: file.replace('.md', '')
      }));
  } catch {
    return [];
  }
}

// Page metadata
export async function generateMetadata({ params }) {
  const { version } = await params;
  
  return {
    title: `Patch Notes v${version} - Tabletop Tavern`,
    description: `What's new in Tabletop Tavern version ${version}`,
    openGraph: {
      title: `🎲 Tabletop Tavern v${version} Release Notes`,
      description: 'See what\'s new in your favorite D&D virtual tabletop!',
    }
  };
}