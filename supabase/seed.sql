-- Development-only sample opportunities (Milestone 4).
--
-- This is Supabase's dedicated seed file: `supabase db reset` and
-- `supabase start` run it automatically after every migration in this
-- folder, but `supabase db push` (the command used to apply migrations to
-- a real/production project) never touches it. That is the mechanism that
-- keeps this sample data out of production — see docs/database.md.
--
-- Every row below is is_sample = true and is_verified = false. None of
-- these are real opportunities, real organizations, or real deadlines —
-- they exist only so the Opportunities/Saved pages have believable data to
-- render against during development. Application/source URLs point at
-- example.org (IANA's reserved documentation domain), not any live site.

insert into public.opportunities (
  title, organization, description, opportunity_type, format,
  location_text, remote_allowed, min_grade, max_grade,
  cost_type, cost_amount, interest_tags,
  application_deadline, start_date, end_date,
  weekly_commitment_hours, duration_text,
  application_url, source_url,
  is_active, is_verified, is_sample
) values
(
  'Coastal Robotics Summer Intensive',
  'Coastal STEM Alliance',
  'A six-week residential program where students design and build autonomous underwater robots alongside engineering mentors, culminating in a public demo day.',
  'summer_program', 'in_person',
  'San Diego, CA', false, 9, 12,
  'paid', 450, array['Engineering', 'Technology'],
  '2027-02-15T23:59:00Z', '2027-06-20', '2027-08-01',
  25, '6-week residential program',
  'https://example.org/coastal-robotics/apply', 'https://example.org/coastal-robotics',
  true, false, true
),
(
  'Youth Business Plan Competition',
  'National Young Entrepreneurs Network',
  'Teams submit an original business plan addressing a real community problem; finalists pitch to a panel of small-business owners for seed-funding prizes.',
  'competition', 'virtual',
  null, true, 6, 12,
  'free', null, array['Business', 'Entrepreneurship', 'Finance'],
  '2026-08-10T23:59:00Z', null, null,
  3, 'Submit one written plan; no ongoing weekly commitment',
  'https://example.org/ybpc/apply', 'https://example.org/ybpc',
  true, false, true
),
(
  'Community Health Volunteer Corps',
  'Riverside County Health Partners',
  'Volunteers support free community health clinics with intake, translation, and patient navigation under staff supervision — no medical training required to start.',
  'volunteer', 'in_person',
  'Riverside, CA', false, 9, 12,
  'free', null, array['Medicine', 'Public Health', 'Community Service'],
  null, null, null,
  4, 'Year-round, flexible shifts',
  'https://example.org/rchp-volunteer/apply', 'https://example.org/rchp-volunteer',
  true, false, true
),
(
  'High School Data Science Research Fellowship',
  'Bright Horizons Research Institute',
  'A mentored, academic-year research fellowship pairing students with a data scientist to analyze a real public dataset and co-author a final research poster.',
  'research', 'hybrid',
  'Boston, MA', true, 10, 12,
  'free', null, array['Mathematics', 'Computer Science', 'Technology'],
  '2026-10-20T23:59:00Z', '2026-11-01', '2027-05-01',
  6, 'Academic-year mentored research',
  'https://example.org/bhri-fellowship/apply', 'https://example.org/bhri-fellowship',
  true, false, true
),
(
  'State Journalism & Media Scholarship',
  'Midwest Press Foundation',
  'A scholarship for students pursuing journalism or media studies, awarded based on a submitted writing sample and a short essay on local reporting.',
  'scholarship', 'virtual',
  null, true, 11, 12,
  'free', null, array['Writing', 'Journalism'],
  '2027-01-15T23:59:00Z', null, null,
  null, 'One-time application; no ongoing commitment',
  'https://example.org/mpf-scholarship/apply', 'https://example.org/mpf-scholarship',
  true, false, true
),
(
  'Environmental Policy Youth Council',
  'Greenway Civic Initiative',
  'Students research local environmental issues and present policy recommendations to city council members at monthly public meetings.',
  'club', 'hybrid',
  'Portland, OR', true, 8, 12,
  'free', null, array['Environmental Science', 'Government', 'Community Service'],
  '2026-08-25T23:59:00Z', null, null,
  2, 'Monthly meetings, year-round',
  'https://example.org/greenway-council/apply', 'https://example.org/greenway-council',
  true, false, true
),
(
  'Summer Software Engineering Internship',
  'BrightPath Technologies',
  'A ten-week internship where students ship real features on a small product team, with a dedicated engineer mentor and a weekly lunch-and-learn series.',
  'internship', 'virtual',
  null, true, 11, 12,
  'free', null, array['Computer Science', 'Technology', 'Engineering'],
  '2027-02-01T23:59:00Z', '2027-06-01', '2027-08-07',
  20, '10-week internship',
  'https://example.org/brightpath-intern/apply', 'https://example.org/brightpath-intern',
  true, false, true
),
(
  'Visual Arts & Design Portfolio Workshop',
  'Union Street Arts Collective',
  'A two-week studio intensive for building a college-ready portfolio, with daily critiques from working illustrators and designers.',
  'summer_program', 'in_person',
  'Chicago, IL', false, 9, 11,
  'paid', 275, array['Visual Arts', 'Design'],
  '2026-06-01T23:59:00Z', '2026-07-05', '2026-07-19',
  15, '2-week intensive workshop',
  'https://example.org/usac-portfolio/apply', 'https://example.org/usac-portfolio',
  true, false, true
),
(
  'Peer Mentorship & Leadership Program',
  'NextGen Leaders Alliance',
  'Younger students are paired with trained peer mentors for weekly check-ins on study skills, goal-setting, and school transitions.',
  'club', 'virtual',
  null, true, 6, 9,
  'free', null, array['Education', 'Community Service', 'Psychology'],
  null, null, null,
  1, 'Weekly virtual meetups, year-round',
  'https://example.org/nextgen-mentorship/apply', 'https://example.org/nextgen-mentorship',
  true, false, true
),
(
  'Mathematics Olympiad Summer Training Camp',
  'National Math Talent Search',
  'A residential training camp for students preparing for national math olympiad competitions, with daily problem-solving sessions led by former competitors.',
  'competition', 'in_person',
  'Ann Arbor, MI', false, 9, 12,
  'paid', 900, array['Mathematics'],
  '2027-03-01T23:59:00Z', '2027-06-10', '2027-06-24',
  30, '2-week residential training camp',
  'https://example.org/math-olympiad-camp/apply', 'https://example.org/math-olympiad-camp',
  true, false, true
);
