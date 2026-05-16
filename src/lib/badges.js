// Shared badge + dynamic achievement system.
// Used by scoreModal.js and studentDashboard.js.

// ---- Static badges (permanent achievements) ----

export const STATIC_BADGES = [
  { id: 'first_pass',   icon: '🌟', label: 'First Pass',              mascot: '🐣', color: '#f59f00', check: (p)    => p.sessions.filter(s => s.passed).length >= 1 },
  { id: 'stories_5',   icon: '📚', label: '5 Stories',               mascot: '🦉', color: '#1971c2', check: (p)    => new Set(p.sessions.filter(s => s.passed && s.storyType !== 'tingxie').map(s => s.storyId)).size >= 5 },
  { id: 'stories_15',  icon: '📗', label: '15 Stories',              mascot: '🦚', color: '#2f9e44', check: (p)    => new Set(p.sessions.filter(s => s.passed && s.storyType !== 'tingxie').map(s => s.storyId)).size >= 15 },
  { id: 'stories_30',  icon: '📘', label: '30 Stories',              mascot: '🐬', color: '#1971c2', check: (p)    => new Set(p.sessions.filter(s => s.passed && s.storyType !== 'tingxie').map(s => s.storyId)).size >= 30 },
  { id: 'perfect',     icon: '💯', label: 'Perfect Score',           mascot: '🌈', color: '#ae3ec9', check: (p)    => p.sessions.filter(s => s.storyType !== 'tingxie').some(s => s.score >= 100) },
  { id: 'streak_7',    icon: '🔥', label: '7-Day Streak',            mascot: '🐯', color: '#e8590c', check: (p, k) => k >= 7 },
  { id: 'streak_30',   icon: '🏆', label: '30-Day Streak',           mascot: '🦁', color: '#e8590c', check: (p, k) => k >= 30 },
  { id: 'pts_100',     icon: '💎', label: '100 Points',              mascot: '🐬', color: '#1971c2', check: (p)    => p.totalPoints >= 100 },
  { id: 'pts_500',     icon: '👑', label: '500 Points',              mascot: '🦋', color: '#ae3ec9', check: (p)    => p.totalPoints >= 500 },
  { id: 'pts_1000',    icon: '🎯', label: '1,000 Points',            mascot: '🐉', color: '#e03131', check: (p)    => p.totalPoints >= 1000 },
  { id: 'pts_5000',    icon: '🏅', label: '5,000 Points',            mascot: '🦅', color: '#d63939', check: (p)    => p.totalPoints >= 5000 },
  { id: 'challenge_1', icon: '🗡️', label: '初试挑战 First Challenge',  mascot: '🐺', color: '#9c36b5', check: (p)    => p.sessions.some(s => s.passed && (s.storyTags || []).includes('challenge')) },
  { id: 'challenge_5', icon: '⚔️', label: '挑战达人 5 Challenges',     mascot: '🦊', color: '#6741d9', check: (p)    => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('challenge')).map(s => s.storyId)).size >= 5 },
  { id: 'exam_1',      icon: '📝', label: '初上考场 Exam Debut',        mascot: '🦅', color: '#2f9e44', check: (p)    => p.sessions.some(s => s.passed && (s.storyTags || []).includes('past-years')) },
  { id: 'exam_3',      icon: '🎖️', label: '考试达人 Exam Pro',           mascot: '🦉', color: '#0ca678', check: (p)    => new Set(p.sessions.filter(s => s.passed && (s.storyTags || []).includes('past-years')).map(s => s.storyId)).size >= 3 },
  { id: 'picture_1',   icon: '📷', label: '看图说话 Picture Pro',         mascot: '🦜', color: '#1971c2', check: (p)    => p.sessions.some(s => s.passed && s.storyType === 'picture') },
  { id: 'video_1',     icon: '🎬', label: '看视频说话 Video Star',         mascot: '🦜', color: '#e03131', check: (p)    => p.sessions.some(s => s.passed && s.storyType === 'video') },
  { id: 'pb',          icon: '🌈', label: '新纪录 Personal Best',         mascot: '🐦', color: '#f59f00', check: (p)    => p.sessions.some(s => s.isPersonalBest) },
  { id: 'p3_master',   icon: '📕', label: 'P3 Master',                   mascot: '🐨', color: '#2f9e44', check: (p)    => ['p3-xiaomao-diaoyu','p3-huanjing','p3-jieyue','p3-shequ','p3-yundong','p3-challenge-keji','p3-challenge-zhuren'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },
  { id: 'p6_master',   icon: '📙', label: 'P6 Master',                   mascot: '🦁', color: '#e03131', check: (p)    => ['p6-kexue','p6-minzu','p6-shengming','p6-zeren','p6-zixiang-maodun','p6-challenge-shuzi','p6-challenge-xinjiapo','p6-vid-environment','p6-vid-elders','p6-vid-resources'].every(id => p.sessions.some(s => s.passed && s.storyId === id)) },

  { id: 'tingxie_first', icon: '✍️', label: 'First Tingxie', mascot: '🐣', color: '#e8590c',
    check: (p) => p.sessions.some(s => s.storyType === 'tingxie') },

  { id: 'tingxie_ace', icon: '🎯', label: 'Mock Ace', mascot: '🦅', color: '#ae3ec9',
    check: (p) => p.sessions.some(s => s.storyType === 'tingxie' && s.score >= 100 && s.passed) },

  { id: 'tingxie_streak', icon: '🔥', label: 'Streak Scholar', mascot: '🐯', color: '#e8590c',
    check: (p) => {
      const dates = [...new Set(
        p.sessions.filter(s => s.storyType === 'tingxie').map(s => s.date)
      )].sort();
      if (dates.length < 5) return false;
      for (let i = 4; i < dates.length; i++) {
        let streak = true;
        for (let j = 1; j <= 4; j++) {
          const diff = (new Date(dates[i]) - new Date(dates[i - j])) / 86400000;
          if (diff !== j) { streak = false; break; }
        }
        if (streak) return true;
      }
      return false;
    }},

  { id: 'tingxie_comeback', icon: '💪', label: 'Comeback Kid', mascot: '🐺', color: '#d63939',
    check: (p) => {
      const mocks = p.sessions
        .filter(s => s.storyType === 'tingxie' && s.mode === 'mock')
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = 1; i < mocks.length; i++) {
        if (!mocks[i - 1].passed && mocks[i].passed &&
            mocks[i - 1].storyId === mocks[i].storyId) return true;
      }
      return false;
    }},

  { id: 'tingxie_word_master', icon: '🧠', label: 'Word Master', mascot: '🦉', color: '#1971c2',
    check: (p) => (p.masteredWordCount || 0) >= 50 },

  { id: 'tingxie_prepared', icon: '📅', label: 'Prepared', mascot: '🦋', color: '#0ca678',
    check: (p) => (p.completedSchedules || 0) >= 1 },

  { id: 'tingxie_perfect_week', icon: '⭐', label: 'Perfect Week', mascot: '🌈', color: '#f59f00',
    check: (p) => {
      const dates = [...new Set(
        p.sessions.filter(s => s.storyType === 'tingxie').map(s => s.date)
      )].sort();
      if (dates.length < 7) return false;
      for (let i = 6; i < dates.length; i++) {
        let streak = true;
        for (let j = 1; j <= 6; j++) {
          const diff = (new Date(dates[i]) - new Date(dates[i - j])) / 86400000;
          if (diff !== j) { streak = false; break; }
        }
        if (streak) return true;
      }
      return false;
    }},

  { id: 'tingxie_champion', icon: '🏆', label: 'Tingxie Champion', mascot: '🦁', color: '#d63939',
    check: (p) => {
      const passedExams = new Set(
        p.sessions.filter(s => s.storyType === 'tingxie' && s.score >= 90 && s.passed).map(s => s.storyId)
      );
      return passedExams.size >= 5;
    }},
];

export function getEarnedBadgeIds(progress, streak) {
  return new Set(STATIC_BADGES.filter(b => b.check(progress, streak)).map(b => b.id));
}

// ---- Dynamic scaling targets (always something just ahead) ----

function nextAbove(n, tiers) {
  return tiers.find(t => t > n) ?? (n + Math.ceil(n * 0.5));
}

const STREAK_TIERS  = [3, 5, 7, 10, 14, 21, 30, 50, 100];
const POINTS_TIERS  = [100, 250, 500, 1000, 2000, 5000, 10000];
const STORIES_TIERS = [1, 3, 5, 10, 15, 20, 30, 50];

export function getDynamicTargets(progress, streak) {
  const passedCount = new Set(progress.sessions.filter(s => s.passed).map(s => s.storyId)).size;
  const pts = progress.totalPoints || 0;

  const streakTarget  = nextAbove(streak,      STREAK_TIERS);
  const ptsTarget     = nextAbove(pts,         POINTS_TIERS);
  const storiesTarget = nextAbove(passedCount, STORIES_TIERS);

  return [
    { id: `dyn_streak_${streakTarget}`,   icon: '🔥', label: `${streakTarget}-Day Streak`,                  current: streak,      target: streakTarget },
    { id: `dyn_pts_${ptsTarget}`,         icon: '💎', label: `${ptsTarget.toLocaleString()} Points`,         current: pts,         target: ptsTarget },
    { id: `dyn_stories_${storiesTarget}`, icon: '📖', label: `Pass ${storiesTarget} Stories`,                current: passedCount, target: storiesTarget },
  ];
}

// ---- Weekly micro-challenges (reset every Monday) ----

function getISOWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - year) / 86400000) + 1) / 7);
}

function getWeekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // Mon=1 … Sun=7
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function getWeeklyTargets(progress, streak) {
  const week = getISOWeek();
  const weekStart = getWeekStart();

  const weekSessions = progress.sessions.filter(s => new Date(s.date + 'T00:00:00') >= weekStart);
  const weekPassed   = weekSessions.filter(s => s.passed);
  const weekPassedCount = new Set(weekPassed.map(s => s.storyId)).size;
  const weekBestScore   = weekPassed.reduce((m, s) => Math.max(m, s.score), 0);
  const doneChallenge   = weekPassed.some(s => (s.storyTags || []).includes('challenge'));
  const donePicture     = weekPassed.some(s => s.storyType === 'picture');
  const doneVideo       = weekPassed.some(s => s.storyType === 'video');
  const doneExam        = weekPassed.some(s => (s.storyTags || []).includes('past-years'));

  // Goal 1: reading frequency (scale with activity level)
  const allPassedEver = new Set(progress.sessions.filter(s => s.passed).map(s => s.storyId)).size;
  const freqTarget = allPassedEver < 5 ? 2 : allPassedEver < 15 ? 4 : 6;
  const goal1 = {
    id: `wk${week}_read${freqTarget}`,
    icon: '📚',
    label: `Read ${freqTarget} stories this week`,
    current: weekPassedCount,
    target: freqTarget,
    done: weekPassedCount >= freqTarget,
  };

  // Goal 2: score challenge (scales with best score this week)
  const scoreGoal = weekBestScore >= 95 ? 98 : weekBestScore >= 90 ? 95 : 90;
  const goal2 = {
    id: `wk${week}_score${scoreGoal}`,
    icon: scoreGoal >= 95 ? '💯' : '⭐',
    label: `Score ${scoreGoal}+ on any story`,
    current: weekBestScore,
    target: scoreGoal,
    done: weekBestScore >= scoreGoal,
  };

  // Goal 3: variety (rotates by week, avoids already-done tasks)
  let goal3;
  const mod = week % 4;
  if (mod === 0 && !doneChallenge) {
    goal3 = { id: `wk${week}_challenge`, icon: '🗡️', label: 'Complete a Challenge story', current: doneChallenge ? 1 : 0, target: 1, done: doneChallenge };
  } else if (mod === 1 && (!donePicture && !doneVideo)) {
    goal3 = { id: `wk${week}_oral`, icon: '🎬', label: 'Try a Picture or Video oral', current: (donePicture || doneVideo) ? 1 : 0, target: 1, done: donePicture || doneVideo };
  } else if (mod === 2 && !doneExam) {
    goal3 = { id: `wk${week}_exam`, icon: '📝', label: 'Complete an Exam story', current: doneExam ? 1 : 0, target: 1, done: doneExam };
  } else if (mod === 3 && streak < 3) {
    goal3 = { id: `wk${week}_streak3`, icon: '🔥', label: 'Build a 3-day streak', current: streak, target: 3, done: streak >= 3 };
  } else {
    // Fallback: personal best challenge
    const topScore = progress.sessions.filter(s => s.passed).reduce((m, s) => Math.max(m, s.score), 0);
    const pbGoal = topScore >= 95 ? 100 : topScore + 5;
    goal3 = { id: `wk${week}_pb${pbGoal}`, icon: '🌈', label: topScore >= 100 ? 'Perfect — keep the streak!' : `Score ${pbGoal}+ this week`, current: topScore, target: pbGoal, done: topScore >= 100 };
  }

  return [goal1, goal2, goal3];
}
