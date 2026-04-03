import React from 'react';
import { Check, Copy } from 'lucide-react';

interface PaymentMethodsProps {
  copied: boolean;
  onCopy: () => void;
}

export default function PaymentMethods({ copied, onCopy }: PaymentMethodsProps) {
const banks = [
    {
      name: 'Easypaisa',
      logo: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <rect width="24" height="24" rx="6" fill="#00c652"/>
          <path d="M12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 11.4477 17.5523 11 17 11H12V13H15.8293C15.3844 14.7311 13.8385 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C13.4477 8 14.7041 8.76835 15.4188 9.91732L17.1339 8.88827C16.0618 7.16481 14.1636 6 12 6Z" fill="white"/>
          <circle cx="12" cy="12" r="1.5" fill="white"/>
        </svg>
      ),
      bgColor: 'bg-[#00c652]/10',
      textColor: 'text-[#00c652]',
      borderColor: 'border-[#00c652]/20'
    },
    {
      name: 'JazzCash',
      logo: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <rect width="24" height="24" rx="6" fill="#ed1c24"/>
          <path d="M11 7H13V14C13 15.1046 12.1046 16 11 16H9C7.89543 16 7 15.1046 7 14V13H9V14H11V7Z" fill="#ffcc00"/>
          <path d="M17 16H15V14C15 12.8954 15.8954 12 17 12H19V11H15V9H19C20.1046 9 21 9.89543 21 11V14C21 15.1046 20.1046 16 19 16H17Z" fill="white"/>
        </svg>
      ),
      bgColor: 'bg-[#ed1c24]/10',
      textColor: 'text-[#ed1c24]',
      borderColor: 'border-[#ed1c24]/20'
    },
    {
      name: 'NayaPay',
      logo: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <rect width="24" height="24" rx="6" fill="#ff6b00"/>
          <path d="M6 7H8L12 13L16 7H18V17H16V10L12 16L8 10V17H6V7Z" fill="white"/>
          <circle cx="12" cy="12" r="2" fill="white" fillOpacity="0.2"/>
        </svg>
      ),
      bgColor: 'bg-[#ff6b00]/10',
      textColor: 'text-[#ff6b00]',
      borderColor: 'border-[#ff6b00]/20'
    },
    {
      name: 'SadaPay',
      logo: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          <rect width="24" height="24" rx="6" fill="#00e6b8"/>
          <path d="M12 7C9.23858 7 7 9.23858 7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12C17 9.23858 14.7614 7 12 7ZM12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12C15 13.6569 13.6569 15 12 15Z" fill="white"/>
          <path d="M12 10V14M10 12H14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
      bgColor: 'bg-[#00e6b8]/10',
      textColor: 'text-[#00e6b8]',
      borderColor: 'border-[#00e6b8]/20'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {banks.map((bank) => (
          <div 
            key={bank.name}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bank.bgColor} ${bank.borderColor} ${bank.textColor} text-xs font-bold shadow-sm`}
          >
            <div className="w-5 h-5 rounded-full overflow-hidden">
              {bank.logo}
            </div>
            {bank.name}
          </div>
        ))}
      </div>

      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all" />
        
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Account Title</div>
              <div className="text-lg font-bold text-white">Asmat Ullah</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Account Number</div>
            <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-zinc-800/50">
              <div className="font-mono text-xl font-bold tracking-wider text-emerald-500">03416286423</div>
              <button 
                onClick={onCopy}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-all text-xs font-bold"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
