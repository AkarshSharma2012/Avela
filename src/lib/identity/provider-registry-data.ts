/**
 * The provider registry itself (spec section 8) — one static data module,
 * not 140 integration files. Every entry the spec's twelve passion-area
 * lists (A-L) name is represented; a handful of literally-identical
 * concepts repeated across lists under different names ("personal
 * portfolio website," "personal music website," "personal project
 * website," etc.) are modeled once as a single `personal_website` entry
 * tagged with every relevant category group, rather than as near-duplicate
 * rows — the same "content is data, no needless duplication" approach as
 * taxonomy.ts and templates.ts. Every group still resolves at least 10
 * distinct entries when filtered by PROVIDER_REGISTRY.filter(p =>
 * p.categoryGroups.includes(group)) (see provider-registry.test.ts).
 *
 * Only GitHub is tier "oauth" — the only provider with a real, existing,
 * documented OAuth implementation in this codebase (github-oauth.ts,
 * verified against GitHub's own OAuth App docs). GitLab/Bitbucket/ORCID and
 * everything else are honestly registered at "proof_of_control" or
 * "public_link_only" rather than claiming an OAuth capability this
 * codebase does not actually implement — building and safely verifying a
 * second real OAuth integration is out of scope for this pass; see the
 * final report's "live provider configuration needed" section.
 */

import { challengeProvider, linkOnlyProvider, oauthProvider, unsupportedProvider, type ProviderEntry } from "@/lib/identity/provider-registry";

const CONTROL_DIMENSIONS = ["account_or_asset_control", "project_or_activity_exists"] as const;
const RESULT_DIMENSIONS = ["project_or_activity_exists", "output_or_deliverable", "award_or_credential", "third_party_confirmation"] as const;
const CREDENTIAL_DIMENSIONS = ["output_or_deliverable", "award_or_credential"] as const;

const PERSONAL_WEBSITE: ProviderEntry = challengeProvider({
  key: "personal_website",
  studentFacingName: "Personal website",
  categoryGroups: [
    "art_and_design",
    "music_and_audio",
    "performing_arts",
    "writing_and_media",
    "making_and_engineering",
    "business_and_entrepreneurship",
    "general_and_custom",
  ],
  supportableDimensions: CONTROL_DIMENSIONS,
});

const WORDPRESS: ProviderEntry = challengeProvider({
  key: "wordpress",
  studentFacingName: "WordPress",
  categoryGroups: ["writing_and_media", "general_and_custom"],
  supportableDimensions: CONTROL_DIMENSIONS,
});

const WIX: ProviderEntry = challengeProvider({
  key: "wix",
  studentFacingName: "Wix",
  categoryGroups: ["business_and_entrepreneurship", "general_and_custom"],
  supportableDimensions: CONTROL_DIMENSIONS,
});

const SQUARESPACE: ProviderEntry = challengeProvider({
  key: "squarespace",
  studentFacingName: "Squarespace",
  categoryGroups: ["business_and_entrepreneurship", "general_and_custom"],
  supportableDimensions: CONTROL_DIMENSIONS,
});

const ADOBE_PORTFOLIO: ProviderEntry = challengeProvider({
  key: "adobe_portfolio",
  studentFacingName: "Adobe Portfolio",
  categoryGroups: ["art_and_design", "general_and_custom"],
  supportableDimensions: CONTROL_DIMENSIONS,
});

const DEVPOST: ProviderEntry = linkOnlyProvider({
  key: "devpost",
  studentFacingName: "Devpost",
  categoryGroups: ["software_and_technology", "making_and_engineering"],
});

// ---------------------------------------------------------------------------
// A. Software, Coding, and Game Development
// ---------------------------------------------------------------------------

const SOFTWARE_PROVIDERS: ProviderEntry[] = [
  oauthProvider({
    key: "github",
    studentFacingName: "GitHub",
    categoryGroups: ["software_and_technology", "making_and_engineering"],
    projectSelectionSupport: true,
    requiredEnvVars: ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_OAUTH_REDIRECT_URI"],
    supportableDimensions: ["identity_control", "project_or_activity_exists", "account_or_asset_control", "authorship_or_contribution", "role"],
  }),
  challengeProvider({ key: "gitlab", studentFacingName: "GitLab", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "bitbucket", studentFacingName: "Bitbucket", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "codeberg", studentFacingName: "Codeberg", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "replit", studentFacingName: "Replit", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "glitch", studentFacingName: "Glitch", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "stackblitz", studentFacingName: "StackBlitz", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "codepen", studentFacingName: "CodePen", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "scratch", studentFacingName: "Scratch", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "roblox_profile", studentFacingName: "Roblox profile or creation", categoryGroups: ["software_and_technology"] }),
  challengeProvider({ key: "itch_io", studentFacingName: "itch.io", categoryGroups: ["software_and_technology"], supportableDimensions: CONTROL_DIMENSIONS }),
  DEVPOST,
];

// ---------------------------------------------------------------------------
// B. Research, Science, and Academics
// ---------------------------------------------------------------------------

const RESEARCH_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "orcid", studentFacingName: "ORCID", categoryGroups: ["science_and_academics"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "crossref_doi", studentFacingName: "Crossref / DOI", categoryGroups: ["science_and_academics"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "arxiv", studentFacingName: "arXiv", categoryGroups: ["science_and_academics"] }),
  challengeProvider({ key: "zenodo", studentFacingName: "Zenodo", categoryGroups: ["science_and_academics"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "osf", studentFacingName: "Open Science Framework", categoryGroups: ["science_and_academics"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "figshare", studentFacingName: "Figshare", categoryGroups: ["science_and_academics"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "kaggle", studentFacingName: "Kaggle", categoryGroups: ["science_and_academics"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "google_scholar", studentFacingName: "Google Scholar profile", categoryGroups: ["science_and_academics"] }),
  linkOnlyProvider({ key: "researchgate", studentFacingName: "ResearchGate profile", categoryGroups: ["science_and_academics"] }),
  linkOnlyProvider({ key: "academia_edu", studentFacingName: "Academia.edu profile", categoryGroups: ["science_and_academics"] }),
  linkOnlyProvider({ key: "semantic_scholar", studentFacingName: "Semantic Scholar profile", categoryGroups: ["science_and_academics"] }),
  linkOnlyProvider({ key: "institutional_repository", studentFacingName: "Institutional repository", categoryGroups: ["science_and_academics"] }),
];

// ---------------------------------------------------------------------------
// C. Art, Design, and Photography
// ---------------------------------------------------------------------------

const ART_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "behance", studentFacingName: "Behance", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "artstation", studentFacingName: "ArtStation", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "dribbble", studentFacingName: "Dribbble", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "deviantart", studentFacingName: "DeviantArt", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  ADOBE_PORTFOLIO,
  challengeProvider({ key: "figma_community", studentFacingName: "Figma Community", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "sketchfab", studentFacingName: "Sketchfab", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "flickr", studentFacingName: "Flickr", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "five_hundred_px", studentFacingName: "500px", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "unsplash", studentFacingName: "Unsplash", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "cara", studentFacingName: "Cara", categoryGroups: ["art_and_design"], supportableDimensions: CONTROL_DIMENSIONS }),
  PERSONAL_WEBSITE,
];

// ---------------------------------------------------------------------------
// D. Music and Audio
// ---------------------------------------------------------------------------

const MUSIC_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "soundcloud", studentFacingName: "SoundCloud", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "bandcamp", studentFacingName: "Bandcamp", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "spotify_artist_page", studentFacingName: "Spotify artist or podcast page", categoryGroups: ["music_and_audio"] }),
  linkOnlyProvider({ key: "apple_music_artist_page", studentFacingName: "Apple Music artist page", categoryGroups: ["music_and_audio"] }),
  linkOnlyProvider({ key: "youtube_music", studentFacingName: "YouTube Music", categoryGroups: ["music_and_audio"] }),
  challengeProvider({ key: "audiomack", studentFacingName: "Audiomack", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "mixcloud", studentFacingName: "Mixcloud", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "reverbnation", studentFacingName: "ReverbNation", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "beatstars", studentFacingName: "BeatStars", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "audius", studentFacingName: "Audius", categoryGroups: ["music_and_audio"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "vimeo_audio_link", studentFacingName: "Vimeo performance link", categoryGroups: ["music_and_audio"] }),
  PERSONAL_WEBSITE,
];

// ---------------------------------------------------------------------------
// E. Video, Film, Performance, and Media
// ---------------------------------------------------------------------------

const MEDIA_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "youtube", studentFacingName: "YouTube", categoryGroups: ["performing_arts", "writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "vimeo", studentFacingName: "Vimeo", categoryGroups: ["performing_arts", "writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "twitch", studentFacingName: "Twitch", categoryGroups: ["performing_arts", "writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "dailymotion", studentFacingName: "Dailymotion", categoryGroups: ["performing_arts", "writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "loom", studentFacingName: "Loom", categoryGroups: ["performing_arts", "writing_and_media"] }),
  linkOnlyProvider({ key: "tiktok_public_page", studentFacingName: "TikTok public page", categoryGroups: ["performing_arts", "writing_and_media"] }),
  linkOnlyProvider({ key: "instagram_public_project_page", studentFacingName: "Instagram public project page", categoryGroups: ["performing_arts", "writing_and_media"] }),
  challengeProvider({ key: "newgrounds", studentFacingName: "Newgrounds", categoryGroups: ["performing_arts", "writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "filmfreeway_public_project", studentFacingName: "FilmFreeway public project page", categoryGroups: ["performing_arts", "writing_and_media"] }),
  linkOnlyProvider({ key: "podcast_rss_feed", studentFacingName: "Podcast RSS feed", categoryGroups: ["performing_arts", "writing_and_media"] }),
  unsupportedProvider({ key: "public_school_or_theater_program", studentFacingName: "Public school or theater program page", categoryGroups: ["performing_arts", "writing_and_media"] }),
  PERSONAL_WEBSITE,
];

// ---------------------------------------------------------------------------
// F. Writing and Publishing
// ---------------------------------------------------------------------------

const WRITING_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "medium", studentFacingName: "Medium", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "substack", studentFacingName: "Substack", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  WORDPRESS,
  challengeProvider({ key: "blogger", studentFacingName: "Blogger", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "ghost", studentFacingName: "Ghost", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "wattpad", studentFacingName: "Wattpad", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "vocal_media", studentFacingName: "Vocal Media", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "issuu", studentFacingName: "Issuu", categoryGroups: ["writing_and_media"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "scribd_public_document", studentFacingName: "Scribd public document", categoryGroups: ["writing_and_media"] }),
  PERSONAL_WEBSITE,
  unsupportedProvider({ key: "school_newspaper_public_page", studentFacingName: "School newspaper public page", categoryGroups: ["writing_and_media"] }),
  linkOnlyProvider({ key: "public_literary_journal_page", studentFacingName: "Public literary journal page", categoryGroups: ["writing_and_media"] }),
];

// ---------------------------------------------------------------------------
// G. Maker, Engineering, and Physical Projects
// ---------------------------------------------------------------------------

const MAKER_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "instructables", studentFacingName: "Instructables", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "hackster", studentFacingName: "Hackster", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "arduino_project_hub", studentFacingName: "Arduino Project Hub", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "thingiverse", studentFacingName: "Thingiverse", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "printables", studentFacingName: "Printables", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "makerworld", studentFacingName: "MakerWorld", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "grabcad", studentFacingName: "GrabCAD", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "autodesk_gallery", studentFacingName: "Autodesk Gallery", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "tinkercad_public_gallery", studentFacingName: "Tinkercad public gallery", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  DEVPOST,
  challengeProvider({ key: "hackaday_io", studentFacingName: "Hackaday.io", categoryGroups: ["making_and_engineering"], supportableDimensions: CONTROL_DIMENSIONS }),
  PERSONAL_WEBSITE,
];

// ---------------------------------------------------------------------------
// H. Entrepreneurship and Small Business
// ---------------------------------------------------------------------------

const BUSINESS_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "shopify_storefront", studentFacingName: "Shopify storefront", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "etsy_shop", studentFacingName: "Etsy shop", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  WIX,
  SQUARESPACE,
  challengeProvider({ key: "square_online", studentFacingName: "Square Online", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "gumroad", studentFacingName: "Gumroad", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "ko_fi", studentFacingName: "Ko-fi", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "patreon_public_page", studentFacingName: "Patreon public page", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "ebay_public_seller_page", studentFacingName: "eBay public seller page", categoryGroups: ["business_and_entrepreneurship"] }),
  challengeProvider({ key: "big_cartel", studentFacingName: "Big Cartel", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "woocommerce_storefront", studentFacingName: "WooCommerce storefront", categoryGroups: ["business_and_entrepreneurship"], supportableDimensions: CONTROL_DIMENSIONS }),
  PERSONAL_WEBSITE,
];

// ---------------------------------------------------------------------------
// I. Sports, Fitness, and Competition
// ---------------------------------------------------------------------------
//
// Strava/Chess.com/Lichess entries are profile-bio proof-of-control only —
// never activity/GPS/workout-data import (hard constraint: no GPS history,
// no private workout data, no exact training routes).

const SPORTS_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "strava", studentFacingName: "Strava", categoryGroups: ["sports_and_competition"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "chess_com", studentFacingName: "Chess.com", categoryGroups: ["sports_and_competition"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "lichess", studentFacingName: "Lichess", categoryGroups: ["sports_and_competition"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "fide_public_ratings", studentFacingName: "FIDE public ratings", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "us_chess_public_records", studentFacingName: "US Chess public records", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "athletic_net", studentFacingName: "Athletic.net", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "maxpreps", studentFacingName: "MaxPreps", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "official_tournament_website", studentFacingName: "Official tournament website", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "official_league_roster", studentFacingName: "Official league roster", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  linkOnlyProvider({ key: "official_competition_result_page", studentFacingName: "Official competition result page", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
  unsupportedProvider({ key: "school_athletics_public_page", studentFacingName: "School athletics public page", categoryGroups: ["sports_and_competition"] }),
  linkOnlyProvider({ key: "martial_arts_org_result_page", studentFacingName: "Martial-arts organization result page", categoryGroups: ["sports_and_competition"], supportableDimensions: RESULT_DIMENSIONS }),
];

// ---------------------------------------------------------------------------
// J. Community Service, Leadership, and Events
// ---------------------------------------------------------------------------

const COMMUNITY_PROVIDERS: ProviderEntry[] = [
  challengeProvider({ key: "volunteermatch", studentFacingName: "VolunteerMatch", categoryGroups: ["community_and_leadership"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "givepulse", studentFacingName: "GivePulse", categoryGroups: ["community_and_leadership"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "mobilize", studentFacingName: "Mobilize", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "official_nonprofit_page", studentFacingName: "Official nonprofit page", categoryGroups: ["community_and_leadership"] }),
  linkOnlyProvider({ key: "official_event_page", studentFacingName: "Official event page", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "school_club_public_page", studentFacingName: "School club public page", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "community_center_page", studentFacingName: "Community-center page", categoryGroups: ["community_and_leadership"] }),
  linkOnlyProvider({ key: "eventbrite_public_event", studentFacingName: "Eventbrite public event", categoryGroups: ["community_and_leadership"] }),
  linkOnlyProvider({ key: "public_fundraiser_page", studentFacingName: "Public fundraiser page", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "local_government_volunteer_page", studentFacingName: "Local-government volunteer page", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "library_program_page", studentFacingName: "Library program page", categoryGroups: ["community_and_leadership"] }),
  unsupportedProvider({ key: "organization_newsletter_or_announcement", studentFacingName: "Organization newsletter or announcement", categoryGroups: ["community_and_leadership"] }),
];

// ---------------------------------------------------------------------------
// K. Learning, Courses, and Credentials
// ---------------------------------------------------------------------------

const LEARNING_PROVIDERS: ProviderEntry[] = [
  linkOnlyProvider({ key: "coursera_credential_page", studentFacingName: "Coursera credential page", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "edx_credential_page", studentFacingName: "edX credential page", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "udemy_certificate_page", studentFacingName: "Udemy certificate page", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "khan_academy_public_profile", studentFacingName: "Khan Academy public profile", categoryGroups: ["learning_and_credentials"] }),
  challengeProvider({ key: "codecademy_public_profile", studentFacingName: "Codecademy public profile", categoryGroups: ["learning_and_credentials"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "freecodecamp_public_profile", studentFacingName: "freeCodeCamp public profile", categoryGroups: ["learning_and_credentials"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "credly", studentFacingName: "Credly", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "accredible", studentFacingName: "Accredible", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "linkedin_learning_certificate_link", studentFacingName: "LinkedIn Learning certificate link", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  unsupportedProvider({ key: "official_school_course_record", studentFacingName: "Official school course record", categoryGroups: ["learning_and_credentials"] }),
  linkOnlyProvider({ key: "issuer_credential_page", studentFacingName: "Issuer credential page", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
  linkOnlyProvider({ key: "language_test_credential_page", studentFacingName: "Language-test credential page", categoryGroups: ["learning_and_credentials"], supportableDimensions: CREDENTIAL_DIMENSIONS }),
];

// ---------------------------------------------------------------------------
// L. General Personal Websites and Custom Activities
// ---------------------------------------------------------------------------

const GENERAL_PROVIDERS: ProviderEntry[] = [
  PERSONAL_WEBSITE,
  WORDPRESS,
  WIX,
  SQUARESPACE,
  challengeProvider({ key: "google_sites_public_page", studentFacingName: "Google Sites public page", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "notion_public_page", studentFacingName: "Notion public page", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "carrd", studentFacingName: "Carrd", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
  challengeProvider({ key: "webflow", studentFacingName: "Webflow", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
  ADOBE_PORTFOLIO,
  challengeProvider({ key: "github_pages", studentFacingName: "GitHub Pages", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
  linkOnlyProvider({ key: "public_cloud_document", studentFacingName: "Public cloud document", categoryGroups: ["general_and_custom"] }),
  challengeProvider({ key: "custom_public_page", studentFacingName: "Any other public page you control", categoryGroups: ["general_and_custom"], supportableDimensions: CONTROL_DIMENSIONS }),
];

const ALL_GROUPED_PROVIDERS: ProviderEntry[] = [
  ...SOFTWARE_PROVIDERS,
  ...RESEARCH_PROVIDERS,
  ...ART_PROVIDERS,
  ...MUSIC_PROVIDERS,
  ...MEDIA_PROVIDERS,
  ...WRITING_PROVIDERS,
  ...MAKER_PROVIDERS,
  ...BUSINESS_PROVIDERS,
  ...SPORTS_PROVIDERS,
  ...COMMUNITY_PROVIDERS,
  ...LEARNING_PROVIDERS,
  ...GENERAL_PROVIDERS,
];

/** Deduplicated by key — several entries above (e.g. PERSONAL_WEBSITE, WORDPRESS, DEVPOST) are deliberately reused across more than one group's list. */
export const PROVIDER_REGISTRY: readonly ProviderEntry[] = Array.from(
  new Map(ALL_GROUPED_PROVIDERS.map((entry) => [entry.key, entry])).values()
);
