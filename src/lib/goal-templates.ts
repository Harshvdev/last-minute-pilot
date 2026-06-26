// Goal templates — quick-start presets for common goal types.
// Each template pre-fills the new-goal form and can optionally auto-run
// AI breakdown. Templates are deterministic (no LLM needed for the template
// itself); the LLM is only used if the user keeps auto-breakdown on.

export interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  rawInput: string;
  category: 'work' | 'study' | 'personal' | 'health' | 'project' | 'other';
  goalType: 'one_time' | 'habit';
  deadlineDaysFromNow: number | null; // null = no deadline
  icon: string; // lucide icon name
  estimatedMinutes: number; // total rough effort
  popular?: boolean;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'hackathon',
    title: 'Ship a hackathon project',
    description: 'Build a working demo for a weekend hackathon.',
    rawInput:
      'I have a hackathon this weekend. I have not started. Need a working demo by Sunday 6pm with a hero feature, a pitch script, and a deployment.',
    category: 'project',
    goalType: 'one_time',
    deadlineDaysFromNow: 4,
    icon: 'Rocket',
    estimatedMinutes: 600,
    popular: true,
  },
  {
    id: 'exam-prep',
    title: 'Prepare for an exam',
    description: 'Study for an upcoming exam with spaced practice.',
    rawInput:
      'I have an exam coming up. Need to gather materials, review the syllabus, study key concepts, work through practice problems, and do a final review the day before.',
    category: 'study',
    goalType: 'one_time',
    deadlineDaysFromNow: 7,
    icon: 'GraduationCap',
    estimatedMinutes: 720,
    popular: true,
  },
  {
    id: 'blog-post',
    title: 'Write a blog post',
    description: 'Research, draft, and publish a 1500-word article.',
    rawInput:
      'Write a 1500-word blog post. Need to research the topic, outline the structure, write intro + body + conclusion, add a customer quote, and end with a CTA.',
    category: 'work',
    goalType: 'one_time',
    deadlineDaysFromNow: 5,
    icon: 'PenLine',
    estimatedMinutes: 480,
  },
  {
    id: 'running-habit',
    title: 'Run 3x per week',
    description: 'Build a consistent running habit.',
    rawInput:
      'Build a running habit — 3 short runs a week, 30 min each. Mix easy runs with one interval session.',
    category: 'health',
    goalType: 'habit',
    deadlineDaysFromNow: null,
    icon: 'Footprints',
    estimatedMinutes: 90,
    popular: true,
  },
  {
    id: 'reading-habit',
    title: 'Read 20 min daily',
    description: 'Build a daily reading habit.',
    rawInput:
      'Build a daily reading habit — 20 minutes every evening. Track books finished and rotate between fiction and nonfiction.',
    category: 'personal',
    goalType: 'habit',
    deadlineDaysFromNow: null,
    icon: 'BookOpen',
    estimatedMinutes: 140,
  },
  {
    id: 'product-launch',
    title: 'Launch a side project',
    description: 'Take a side project from idea to launch.',
    rawInput:
      'Launch a side project: validate the idea, build an MVP, set up landing page + waitlist, write launch post, and ship to Product Hunt.',
    category: 'project',
    goalType: 'one_time',
    deadlineDaysFromNow: 21,
    icon: 'Rocket',
    estimatedMinutes: 1200,
  },
  {
    id: 'course-finish',
    title: 'Finish an online course',
    description: 'Complete a course end-to-end with notes.',
    rawInput:
      'Finish an online course: watch all modules, take structured notes, complete the exercises, and build a capstone project.',
    category: 'study',
    goalType: 'one_time',
    deadlineDaysFromNow: 14,
    icon: 'GraduationCap',
    estimatedMinutes: 900,
  },
  {
    id: 'home-declutter',
    title: 'Declutter a room',
    description: 'Sort, donate, and organize one room.',
    rawInput:
      'Declutter one room: sort items into keep/donate/trash, clean surfaces, organize storage, and take before/after photos.',
    category: 'personal',
    goalType: 'one_time',
    deadlineDaysFromNow: 3,
    icon: 'Home',
    estimatedMinutes: 240,
  },
];

export function templateToGoalInput(template: GoalTemplate) {
  const now = new Date();
  const deadline =
    template.deadlineDaysFromNow !== null
      ? new Date(
          now.getTime() + template.deadlineDaysFromNow * 24 * 60 * 60 * 1000
        ).toISOString()
      : null;
  return {
    title: template.title,
    rawInput: template.rawInput,
    goalType: template.goalType,
    deadline,
    category: template.category,
  };
}
