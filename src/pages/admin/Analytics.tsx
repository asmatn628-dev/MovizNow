import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { AnalyticsEvent, UserProfile } from '../../types';
import { BarChart3, Film, Link as LinkIcon, Users, Clock, Activity } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';

export default function Analytics() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'day' | 'week' | 'month' | 'year'>('week');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch events
        const eventsRef = collection(db, 'analytics');
        
        const now = new Date();
        let startDate = new Date();
        if (timeRange === 'day') startDate.setDate(now.getDate() - 1);
        if (timeRange === 'week') startDate.setDate(now.getDate() - 7);
        if (timeRange === 'month') startDate.setMonth(now.getMonth() - 1);
        if (timeRange === 'year') startDate.setFullYear(now.getFullYear() - 1);

        const q = query(
          eventsRef,
          where('timestamp', '>=', startDate.toISOString()),
          orderBy('timestamp', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const eventsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AnalyticsEvent));
        setEvents(eventsData);

        // Fetch users for top users
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setUsers(usersData);
      } catch (error) {
        console.error('Error fetching analytics:', error);
        handleFirestoreError(error, OperationType.LIST, 'analytics/users');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  // Process data
  const contentClicks = events.filter(e => e.type === 'content_click');
  const linkClicks = events.filter(e => e.type === 'link_click');
  const sessionStarts = events.filter(e => e.type === 'session_start');
  const timeSpentEvents = events.filter(e => e.type === 'time_spent');

  // Top Content
  const contentCounts = contentClicks.reduce((acc, event) => {
    if (event.contentId && event.contentTitle) {
      acc[event.contentId] = {
        title: event.contentTitle,
        count: (acc[event.contentId]?.count || 0) + 1
      };
    }
    return acc;
  }, {} as Record<string, { title: string, count: number }>);
  
  const topContent = (Object.values(contentCounts) as { title: string, count: number }[])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top Links
  const linkCounts = linkClicks.reduce((acc, event) => {
    if (event.linkId && event.linkName && event.contentTitle) {
      const key = `${event.contentId}_${event.linkId}`;
      acc[key] = {
        contentTitle: event.contentTitle,
        linkName: event.linkName,
        count: (acc[key]?.count || 0) + 1
      };
    }
    return acc;
  }, {} as Record<string, { contentTitle: string, linkName: string, count: number }>);

  const topLinks = (Object.values(linkCounts) as { contentTitle: string, linkName: string, count: number }[])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate sessions and time spent per user in the selected period
  const userStats = users.map(user => {
    const userSessions = sessionStarts.filter(e => e.userId === user.uid).length;
    const userTimeSpent = timeSpentEvents
      .filter(e => e.userId === user.uid)
      .reduce((total, e) => total + (e.duration || 0), 0);
      
    return {
      ...user,
      periodSessions: userSessions,
      periodTimeSpent: userTimeSpent
    };
  });

  // Top Users by sessions and time spent in period
  const topUsersBySessions = [...userStats]
    .sort((a, b) => b.periodSessions - a.periodSessions)
    .slice(0, 10);
    
  const topUsersByTime = [...userStats]
    .sort((a, b) => b.periodTimeSpent - a.periodTimeSpent)
    .slice(0, 10);

  const totalTimeSpent = timeSpentEvents.reduce((total, e) => total + (e.duration || 0), 0);
  const activeUsersCount = userStats.filter(u => u.periodSessions > 0 || u.periodTimeSpent > 0).length;
  const avgTimePerUser = activeUsersCount > 0 ? Math.round(totalTimeSpent / activeUsersCount) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-emerald-500" />
            Analytics Dashboard
          </h1>
          <p className="text-zinc-400 mt-1">Track usage, content popularity, and user engagement.</p>
        </div>
        
        <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
          {(['day', 'week', 'month', 'year'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                timeRange === range 
                  ? 'bg-emerald-500 text-white' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">App Sessions</p>
              <h3 className="text-2xl font-bold text-white">{sessionStarts.length}</h3>
            </div>
          </div>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">Content Views</p>
              <h3 className="text-2xl font-bold text-white">{contentClicks.length}</h3>
            </div>
          </div>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl">
              <LinkIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">Link Clicks</p>
              <h3 className="text-2xl font-bold text-white">{linkClicks.length}</h3>
            </div>
          </div>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">Avg Time / User</p>
              <h3 className="text-2xl font-bold text-white">
                {avgTimePerUser} min
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Content */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Film className="w-5 h-5 text-emerald-500" />
            Top Movies & Series
          </h2>
          <div className="space-y-4">
            {topContent.length > 0 ? topContent.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-600 w-6">{index + 1}</span>
                  <span className="font-medium text-white">{item.title}</span>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {item.count} views
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 text-center py-4">No content views in this period.</p>
            )}
          </div>
        </div>

        {/* Top Links */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-emerald-500" />
            Top Links Clicked
          </h2>
          <div className="space-y-4">
            {topLinks.length > 0 ? topLinks.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-600 w-6">{index + 1}</span>
                  <div>
                    <p className="font-medium text-white">{item.contentTitle}</p>
                    <p className="text-sm text-zinc-400">{item.linkName}</p>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {item.count} clicks
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 text-center py-4">No link clicks in this period.</p>
            )}
          </div>
        </div>

        {/* Top Users by Sessions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" />
            Most Active Users (Sessions)
          </h2>
          <div className="space-y-4">
            {topUsersBySessions.filter(u => u.periodSessions > 0).length > 0 ? topUsersBySessions.filter(u => u.periodSessions > 0).map((user, index) => (
              <div key={user.uid} className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-600 w-6">{index + 1}</span>
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                        {user.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">{user.displayName || 'Anonymous'}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {user.periodSessions} sessions
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 text-center py-4">No user session data available.</p>
            )}
          </div>
        </div>

        {/* Top Users by Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-500" />
            Most Active Users (Time Spent)
          </h2>
          <div className="space-y-4">
            {topUsersByTime.filter(u => u.periodTimeSpent > 0).length > 0 ? topUsersByTime.filter(u => u.periodTimeSpent > 0).map((user, index) => (
              <div key={user.uid} className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-zinc-600 w-6">{index + 1}</span>
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                        {user.email[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">{user.displayName || 'Anonymous'}</p>
                      <p className="text-xs text-zinc-500">{user.email}</p>
                    </div>
                  </div>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-sm font-medium">
                  {user.periodTimeSpent} min
                </span>
              </div>
            )) : (
              <p className="text-zinc-500 text-center py-4">No user time data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
