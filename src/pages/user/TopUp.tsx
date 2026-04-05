import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Copy, Check, Send, Loader2, Wallet, Smartphone, CreditCard, Banknote } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import PreviousOrders from '../../components/PreviousOrders';

import PaymentMethods from '../../components/PaymentMethods';

export default function TopUp() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [months, setMonths] = useState(1);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const isExtend = location.state?.isExtend;
  const isTrial = profile?.role === 'trial';
  const isExpired = profile?.status === 'expired';

  const actionText = isExtend ? 'Extend' : (isExpired && profile?.role === 'user' ? 'Renew' : 'Get');

  const handleCopy = () => {
    navigator.clipboard.writeText('03416286423');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendNow = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const orderId = Math.floor(10000000 + Math.random() * 90000000).toString();

      await setDoc(doc(db, 'orders', orderId), {
        userId: profile.uid,
        userName: profile.displayName || 'Unknown',
        userEmail: profile.email,
        userRole: profile.role,
        type: 'membership',
        amount: months * 200,
        months,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      const message = `${actionText} Membership\nOrder ID: ${orderId}\nMonths: ${months}\nAmount: Rs ${months * 200}`;
      const whatsappUrl = `https://wa.me/923363284466?text=${encodeURIComponent(message)}`;
      
      window.open(whatsappUrl, '_blank');
      navigate('/');
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white p-4 md:p-8 transition-colors duration-300"
    >
      <div className="max-w-md mx-auto">
        <button onClick={() => navigate('/')} className="flex items-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white mb-6 transition-all active:scale-95">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Home
        </button>

        <h1 className="text-2xl font-bold mb-6">Top Up Membership</h1>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Membership Details</h2>
          <div className="flex items-center justify-between mb-4">
            <span>Duration (Months)</span>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setMonths(Math.max(1, months - 1))}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
              >
                -
              </button>
              <span className="text-xl font-bold">{months}</span>
              <button 
                onClick={() => setMonths(months + 1)}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-zinc-700"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
            <span className="text-zinc-500 dark:text-zinc-400">Total Amount</span>
            <span className="text-2xl font-bold text-red-500">Rs {months * 200}</span>
          </div>
        </div>

        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 mb-6 shadow-2xl border border-zinc-200 dark:border-zinc-800/50">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-500" />
            Payment Details
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-sm">
            Please send the payment to the following account via any of these methods:
          </p>
          
          <PaymentMethods copied={copied} onCopy={handleCopy} />
        </div>

        <div className="text-center mb-6">
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            After Payment Send Screenshot for Confirmation
          </p>
        </div>

        <button
          onClick={handleSendNow}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          {loading ? 'Processing...' : 'Send Now'}
        </button>

        <PreviousOrders />
      </div>
    </motion.div>
  );
}
