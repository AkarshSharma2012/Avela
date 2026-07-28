import { crossrefConnector } from "@/lib/osint/connectors/crossref";
import { githubConnector } from "@/lib/osint/connectors/github";
import { officialPageConnector } from "@/lib/osint/connectors/official-page";
import { rdapConnector } from "@/lib/osint/connectors/rdap";
import { urlReputationConnector } from "@/lib/osint/connectors/url-reputation";
import type { Connector } from "@/lib/osint/types";

/** Every registered connector, in the order the progress UI (spec section 9) shows them run. */
export const ALL_CONNECTORS: readonly Connector[] = [officialPageConnector, githubConnector, crossrefConnector, rdapConnector, urlReputationConnector];

export { crossrefConnector, githubConnector, officialPageConnector, rdapConnector, urlReputationConnector };
