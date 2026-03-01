interface Props {
  title: string | null;
  text: string | null;
  moral: string | null;
  isLoading: boolean;
}

// Skeleton loading placeholder
function Skeleton() {
  return (
    <div className="flex flex-col gap-3 p-6 bg-white rounded-2xl border border-purple-100 min-h-52 animate-pulse">
      <div className="h-5 bg-purple-100 rounded-xl w-3/4" />
      <div className="h-4 bg-gray-100 rounded-xl" />
      <div className="h-4 bg-gray-100 rounded-xl w-5/6" />
      <div className="h-4 bg-gray-100 rounded-xl w-4/6" />
      <div className="h-4 bg-gray-100 rounded-xl" />
      <div className="h-4 bg-gray-100 rounded-xl w-3/5" />
      <div className="h-4 bg-gray-100 rounded-xl w-5/6" />
    </div>
  );
}

// Empty state placeholder
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 bg-gradient-to-br from-purple-50 via-pink-50 to-yellow-50 rounded-2xl border-2 border-dashed border-purple-200 min-h-52 text-center">
      <span className="text-6xl animate-float">🌟</span>
      <p className="text-purple-600 font-bold text-lg">Draw something magical!</p>
      <p className="text-purple-400 text-sm max-w-48">
        Pick up a brush, create your world, then tap <strong>Generate Story</strong>.
      </p>
    </div>
  );
}

export default function StoryPanel({ title, text, moral, isLoading }: Props) {
  if (isLoading) return <Skeleton />;
  if (!text) return <EmptyState />;

  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);

  return (
    <div className="flex flex-col gap-4 p-6 bg-white rounded-2xl border border-purple-100 shadow-inner">
      {title && (
        <h2 className="text-xl font-bold text-purple-900 font-serif leading-snug">
          ✨ {title}
        </h2>
      )}

      <div className="flex flex-col gap-3">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-gray-700 leading-relaxed text-[0.95rem] font-sans">
            {para}
          </p>
        ))}
      </div>

      {moral && (
        <div className="mt-2 px-4 py-3 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl border border-amber-200">
          <p className="text-sm text-amber-800">
            <span className="font-bold">💛 Moral: </span>
            {moral}
          </p>
        </div>
      )}
    </div>
  );
}
