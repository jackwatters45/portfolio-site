import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BulkImageStager } from "../src/components/bulk-image-stager";

describe("bulk image staging shell", () => {
  it("renders an isolated modal without committing during staging", () => {
    let commits = 0;
    const markup = renderToStaticMarkup(
      <BulkImageStager
        initialFiles={[]}
        initialOmitted={0}
        initialTruncated={false}
        initialFailures={[]}
        maxItems={20}
        onClose={() => undefined}
        onCommit={() => {
          commits += 1;
          return null;
        }}
      />,
    );
    expect(commits).toBe(0);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Choose what belongs");
    expect(markup).toContain("Loose grid");
    expect(markup).toContain("Contact sheet");
    expect(markup).toContain("Masonry");
    expect(markup).toContain("Add files");
    expect(markup).toContain("Add folder");
    expect(markup).toContain(".heic,.heif,.hif");
  });
});
