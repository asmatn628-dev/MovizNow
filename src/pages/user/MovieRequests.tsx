import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, limit, where, getDocs, updateDoc, doc, arrayUnion, increment } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { Film, Plus, Search, Clock, CheckCircle2, XCircle, MessageCircle, ArrowLeft, Tv, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { format } from 'date-fns';

interface MovieRequest {
  id: string;
  title: string;
  type: 'movie' | 'series';
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: string;
  requestedBy: string[];
  requestCount: number;
}

export default function MovieRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<MovieRequest[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({ title: '', type: 'movie' as 'movie' | 'series' });
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [userRequestCount, setUserRequestCount] = useState(0);

  const MAX_REQUESTS_PER_USER = 5;

  useEffect(() => {
    const q = query(collection(db, 'movie_requests'), orderBy('requestCount', 'desc'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MovieRequest));
      setRequests(data);
      setLoading(false);

      if (profile) {
        const count = data.filter(r => r.userId === profile.uid).length;
        setUserRequestCount(count);
      }
    }, (error) => {
      console.error("Requests snapshot error:", error);
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'movie_requests');
    });

    return () => unsub();
  }, [profile]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newRequest.title.trim() || submitting) return;

    if (userRequestCount >= MAX_REQUESTS_PER_USER) {
      alert(`You can only have ${MAX_REQUESTS_PER_USER} active requests at a time.`);
      return;
    }

    setSubmitting(true);
    try {
      // Check if this movie is already requested
      const existingRequest = requests.find(r => r.title.toLowerCase() === newRequest.title.toLowerCase() && r.type === newRequest.type);

      if (existingRequest) {
        if (existingRequest.requestedBy.includes(profile.uid)) {
          alert("You have already requested this movie.");
        } else {
          // Add user to existing request
          await updateDoc(doc(db, 'movie_requests', existingRequest.id), {
            requestedBy: arrayUnion(profile.uid),
            requestCount: increment(1)
          });
          alert("Your vote has been added to this request!");
        }
      } else {
        // Create new request
        await addDoc(collection(db, 'movie_requests'), {
          title: newRequest.title.trim(),
          type: newRequest.type,
          userId: profile.uid,
          userEmail: profile.email,
          userName: profile.displayName || 'User',
          status: 'pending',
          createdAt: new Date().toISOString(),
          requestedBy: [profile.uid],
          requestCount: 1
        });
        alert("Request submitted successfully!");
      }

      setNewRequest({ title: '', type: 'movie' });
      setIsRequestModalOpen(false);
    } catch (error) {
      console.error("Error submitting request:", error);
      alert("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvote = async (requestId: string) => {
    if (!profile) return;
    const request = requests.find(r => r.id === requestId);
    if (!request || request.requestedBy.includes(profile.uid)) return;

    try {
      await updateDoc(doc(db, 'movie_requests', requestId), {
        requestedBy: arrayUnion(profile.uid),
        requestCount: increment(1)
      });
    } catch (error) {
      console.error("Error upvoting:", error);
    }
  };

  const filteredRequests = requests.filter(r => 
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-500" />
              Movie Requests
            </h1>
          </div>
          
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Request New
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        {/* Info Box */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-8 flex items-start gap-4">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <AlertCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-200">How it works</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Can't find what you're looking for? Request it here! If others want the same thing, they can upvote your request. 
              Popular requests are prioritized by our team.
            </p>
            <div className="mt-3 flex items-center gap-4">
              <span className="text-xs font-medium px-2 py-1 bg-zinc-800 rounded-lg text-zinc-300 border border-zinc-700">
                Your Requests: {userRequestCount} / {MAX_REQUESTS_PER_USER}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search existing requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 bg-zinc-900/50 rounded-3xl border border-dashed border-zinc-800">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-xl">No requests found</p>
            <button 
              onClick={() => setIsRequestModalOpen(true)}
              className="mt-4 text-emerald-500 hover:underline font-medium"
            >
              Be the first to request a movie!
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((request) => (
              <div 
                key={request.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between group hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={clsx(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    request.type === 'movie' ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
                  )}>
                    {request.type === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                      {request.title}
                      {request.status === 'completed' && (
                        <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Available
                        </span>
                      )}
                      {request.status === 'rejected' && (
                        <span className="bg-red-500/10 text-red-500 text-[10px] px-2 py-0.5 rounded-full border border-red-500/20 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Rejected
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span className="capitalize">{request.type}</span>
                      <span>•</span>
                      <span>Requested by {request.requestCount} user{request.requestCount !== 1 ? 's' : ''}</span>
                      <span>•</span>
                      <span>{format(new Date(request.createdAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {request.status === 'pending' && (
                    <button
                      onClick={() => handleUpvote(request.id)}
                      disabled={request.requestedBy.includes(profile?.uid || '')}
                      className={clsx(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                        request.requestedBy.includes(profile?.uid || '')
                          ? "bg-zinc-800 text-zinc-500 cursor-default"
                          : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                      )}
                    >
                      {request.requestedBy.includes(profile?.uid || '') ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Requested
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          Me Too
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Request Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <button 
              onClick={() => setIsRequestModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white"
            >
              <XCircle className="w-6 h-6" />
            </button>

            <h3 className="text-xl font-bold mb-2">Request Movie/Series</h3>
            <p className="text-zinc-400 mb-6 text-sm">
              Please provide the exact title of the movie or series you want to request.
            </p>

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRequest(prev => ({ ...prev, type: 'movie' }))}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all",
                      newRequest.type === 'movie' 
                        ? "bg-blue-500/10 border-blue-500 text-blue-500" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    )}
                  >
                    <Film className="w-4 h-4" />
                    Movie
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRequest(prev => ({ ...prev, type: 'series' }))}
                    className={clsx(
                      "flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all",
                      newRequest.type === 'series' 
                        ? "bg-purple-500/10 border-purple-500 text-purple-500" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    )}
                  >
                    <Tv className="w-4 h-4" />
                    Series
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Title</label>
                <input
                  type="text"
                  required
                  placeholder="Enter movie or series title..."
                  value={newRequest.title}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !newRequest.title.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors mt-4"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
