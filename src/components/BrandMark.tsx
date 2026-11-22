import { useState } from 'react';
import { GraduationCap } from 'lucide-react';

export const DIU_EMBLEM_URL = '/src/assets/images/diu_emblem_mark_1795325911097.jpg';
export const DIU_CAMPUS_URL = '/src/assets/images/diu_smart_campus_clean_1795325931022.jpg';

export function BrandMark({
  size = 'md',
  showTitle = true,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  showTitle?: boolean;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const dim =
    size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-9 w-9 rounded-xl';

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <div
        className={`${dim} shrink-0 overflow-hidden border border-[#E4EAE6] bg-[#064E3B] flex items-center justify-center shadow-xs`}
      >
        {!imgFailed ? (
          <img
            src={DIU_EMBLEM_URL}
            alt="DIU Admission Assistant Emblem"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <GraduationCap className="h-5 w-5 text-white" />
        )}
      </div>
      {showTitle && (
        <span className="font-display text-[15px] font-bold tracking-tight text-[#111827] truncate">
          DIU Admission Assistant
        </span>
      )}
    </div>
  );
}
