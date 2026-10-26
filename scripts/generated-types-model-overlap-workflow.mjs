import { readFileSync } from "node:fs";

const summaryMarker = "<!-- generated-types-model-overlap -->";
const inlineMarkerPrefix = "<!-- generated-types-model-overlap-file:";
const reviewerTeam = "review-api-models";
const reviewerTeamUrl = `https://github.com/orgs/fylein/teams/${reviewerTeam}`;
const approvedReviewerLogins = new Set([
  "julias0",
  "rvab",
  "mvaishnavi",
  "shishirams222",
  "aniruddha-shriwant",
  "shubham-fyle",
]);

export const publishGeneratedTypeOverlap = async ({
  github,
  context,
  commentPath,
  reportPath,
}) => {
  let markdown = readFileSync(commentPath, "utf8");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const { owner, repo } = context.repo;
  const issue_number = context.issue.number;
  const headSha = context.payload.pull_request.head.sha;
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existingComment = comments.find(
    (comment) =>
      comment.user?.login === "github-actions[bot]" &&
      comment.body?.includes(summaryMarker),
  );

  const findingsByFile = Map.groupBy(
    report.results.filter((result) => result.requiresReview),
    (result) => result.file,
  );
  const pullRequest = { owner, repo, pull_number: issue_number };
  const reviewComments = await github.paginate(
    github.rest.pulls.listReviewComments,
    {
      ...pullRequest,
      per_page: 100,
    },
  );
  const botReviewComments = reviewComments.filter(
    (comment) =>
      comment.user?.login === "github-actions[bot]" &&
      comment.body?.includes(inlineMarkerPrefix),
  );
  const inlineCommentUrls = new Map();

  for (const [path, findings] of findingsByFile) {
    const marker = `${inlineMarkerPrefix}${path} -->`;
    const imports = [
      ...Map.groupBy(findings, (finding) => finding.closest.role),
    ]
      .map(([role, roleFindings]) => {
        const names = [
          ...new Set(roleFindings.map((finding) => finding.closest.name)),
        ].sort();
        return `import { ${names.join(", ")} } from '@fylein/types/${role}';`;
      })
      .join("\n");
    const matches = findings
      .map(
        (finding) =>
          `- \`${finding.exportName}\` → \`${finding.closest.name}\` (${finding.closest.structuralCoverage.toFixed(1)}% structural overlap)`,
      )
      .join("\n");
    const inlineBody = `${marker}
This model overlaps generated OpenAPI types above the configured threshold:

${matches}

**Action:** Replace the handwritten model with the generated type where compatible, update its consumers, and remove the local model/export when it is no longer used.

\`\`\`ts
${imports}
\`\`\`

Verify that the suggested role matches the endpoint. For a dynamic multi-role endpoint, use the matching \`@fylein/types/cross-role\` export when available. If the generated contract is not compatible, retain the model and request approval from a member of [@fylein/${reviewerTeam}](${reviewerTeamUrl}).`;
    const existingReviewComment = botReviewComments.find((comment) =>
      comment.body?.includes(marker),
    );
    const response = existingReviewComment
      ? await github.rest.pulls.updateReviewComment({
          owner,
          repo,
          comment_id: existingReviewComment.id,
          body: inlineBody,
        })
      : await github.rest.pulls.createReviewComment({
          ...pullRequest,
          commit_id: headSha,
          path,
          subject_type: "file",
          body: inlineBody,
        });
    inlineCommentUrls.set(path, response.data.html_url);
  }

  for (const comment of botReviewComments) {
    if (!findingsByFile.has(comment.path)) {
      await github.rest.pulls.deleteReviewComment({
        owner,
        repo,
        comment_id: comment.id,
      });
    }
  }

  for (const result of report.results) {
    const encodedFile = result.file
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const fileUrl = `https://github.com/${owner}/${repo}/blob/${headSha}/${encodedFile}`;
    const tableCells = `\`${result.file}\` | \`${result.exportName}\``;
    const linkedTableCells = `[${result.file}](${fileUrl}) | \`${result.exportName}\``;
    markdown = markdown
      .split("\n")
      .map((line) => {
        if (!line.startsWith(tableCells)) {
          return line;
        }
        const linkedLine = line.replace(tableCells, linkedTableCells);
        return result.requiresReview
          ? `${linkedLine} - [View comment](${inlineCommentUrls.get(result.file)})`
          : linkedLine;
      })
      .join("\n");
  }

  const body = `${summaryMarker}\n${markdown}`;
  if (existingComment) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number, body });
  }
};

export const verifyGeneratedTypesApproval = async ({
  github,
  context,
  core,
}) => {
  const { owner, repo } = context.repo;
  const pull_number = context.issue.number;
  const headSha = context.payload.pull_request.head.sha;
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const latestDecisions = new Map(
    reviews
      .filter(
        (review) =>
          review.user &&
          ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state),
      )
      .map((review) => [review.user.login, review]),
  );
  const approval = [...latestDecisions.values()].find(
    (review) =>
      review.state === "APPROVED" &&
      review.commit_id === headSha &&
      approvedReviewerLogins.has(review.user.login.toLowerCase()),
  );

  if (approval) {
    core.info(
      `Approved by @${approval.user.login} from @fylein/${reviewerTeam}.`,
    );
    return;
  }

  const pullRequest = { owner, repo, pull_number };
  const { data: requestedReviewers } =
    await github.rest.pulls.listRequestedReviewers(pullRequest);
  const teamIsRequested = requestedReviewers.teams.some(
    (team) => team.slug === reviewerTeam,
  );
  if (!teamIsRequested) {
    await github.rest.pulls.requestReviewers({
      ...pullRequest,
      team_reviewers: [reviewerTeam],
    });
  }

  core.setFailed(`Approval required from a member of @fylein/${reviewerTeam}.`);
};
