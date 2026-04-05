import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, ChevronUp, Package, Clock, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PreviousOrders() {
  const { profile } = useAuth();
  const CACHE_KEY = `user_orders_cache_${profile?.uid}`;
  const [orders, setOrders] = useState<any[]>(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(orders.length === 0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!profile?.uid) return;
      try {
        const q = query(
          collection(db, 'orders'),
          where('userId', '==', profile.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const fetchedOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        localStorage.setItem(CACHE_KEY, JSON.stringify(fetchedOrders));
        setOrders(fetchedOrders);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [profile?.uid, CACHE_KEY]);

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">Loading previous orders...</div>;
  }

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-emerald-500" />
        Previous Orders
      </h3>
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="bg-zinc-50 dark:bg-zinc-900 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">#{order.id}</span>
                <span className="text-sm font-medium">Rs {order.amount}</span>
              </div>
              <div className="flex items-center gap-3">
                {order.status === 'pending' && <span className="flex items-center gap-1 text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded-full"><Clock className="w-3 h-3" /> Pending</span>}
                {order.status === 'approved' && <span className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3" /> Approved</span>}
                {order.status === 'declined' && <span className="flex items-center gap-1 text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded-full"><XCircle className="w-3 h-3" /> Declined</span>}
                {expandedId === order.id ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </div>
            </button>
            <AnimatePresence>
              {expandedId === order.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4 border-t border-zinc-200 dark:border-zinc-800/50"
                >
                  <div className="pt-3 space-y-2 text-sm text-zinc-500 dark:text-zinc-400">
                    <p><span className="text-zinc-500">Type:</span> {order.type === 'membership' ? 'Membership Top Up' : 'Content Purchase'}</p>
                    {order.type === 'membership' && <p><span className="text-zinc-500">Duration:</span> {order.months} Month(s)</p>}
                    {order.type === 'content' && order.items && (
                      <div>
                        <span className="text-zinc-500">Items:</span>
                        <ul className="list-disc list-inside mt-1 ml-2">
                          {order.items.map((item: any, idx: number) => (
                            <li key={idx}>{item.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p><span className="text-zinc-500">Date:</span> {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'Just now'}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
