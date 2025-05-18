> [!note] This project template:
>
> This begins your capstone development effort.  You will use GitLab as your primary repository for code and documentation.  In these early phases, you may not be delivering 'working software' but you will be delivering just enough documentation to show an understanding of the product in order to communicate a high-level understanding of the product, objectives, scope and quality requirements.  The issues and boards can also be used to collaborate on research.  For those of you on an R&D project, issues are a great way to track each research question.  The comments and team collaboration build a large body of knowledge during your efforts. 
>
>Regarding this readme.md file, ultimately you will update this page to reflect your project and assist anyone who has access to your repository.
>

[[_TOC_]]

# REFERENCES
Read the following articles to familiarize yourself with Gitlab and how you will be expected to use it during your project.

* [How to use GitLab for Agile Software Development](https://about.gitlab.com/blog/2018/03/05/gitlab-for-agile-software-development/). 
* [How to Write a Beautiful and Meaningful README.md*](https://blog.bitsrc.io/how-to-write-beautiful-and-meaningful-readme-md-for-your-next-project-897045e3f991#:~:text=It's%20a%20set%20of%20useful,github%20below%20the%20project%20directory.) - buidling your ReadMe file 
* [Always start with an issue](https://docs.gitlab.com/user/project/issues/) - This article discusses issues and how to use them to collaborate.  Several issue and merge templates are provided in the .gitlab/issue_templates and .gitlab/merge_request_templates.  These should facilitate collaboration and quality. Feel free to edit them to fit the needs of this project.
* [Template Samples](https://gitlab.com/gitlab-org/gitlab/-/tree/master/.gitlab/issue_templates)


# BRANCHING

This project templates includes 2 branches to start with.  

| **Name**   | **Description** |
| ------ | ------ |
| MAIN         | Protected branch.  You cannot push directly to MAIN.  This branch should be what you push to your test server (ceclnx for example) or other devices for your client to review. |
| . . .          | Thereafter, you should follow the code management strategy defined and agreed upon by the team.  I recommend a branch from MAIN for each sprint or interval.  From the sprint-branch, I recommend branching by issue.  Throughout the sprint, rebase your issue branch regularly especially begore a commit.  If an issue is incomplete during the prescribed sprint, commit it to the next spring branch.  This approach gives the MAIN branch an additional degree of protection. |

## Protected Branches
The MAIN branch is the default branch.  There are several protections in place:
1. By default, all team members are added as 'developer'.  
1. Maintainers & developers can merge into MAIN.  
1. Only maintainers can push & merge into MAIN however.  For code quality purposes, then, elect 1-2 team members to act be assigned as a maintainer.
1. **Push constraints require the commit author's email be from miamioh.edu.** Make sure you are using the correct credentials in your IDE (like VS Code) or in your repository manager, like [GitHub Desktop](https://docs.github.com/en/desktop). 

## Merge Constraints
The projects are setup with some merge constraints.
1. All merge requests (MR), regardless of branch, require at least one (1) approval.
1. MRs cannot be approved by the MR author.
1. MRs cannot be approved by a user how has contributed a commit to the MR.

 
# ESTIMATING & TIME TRACKING

**Time tracking is NOT required.**  It's very simple though.  There are other useful quick actions like /done, /assign, /approve and /wip to name a few.

| cmd | purpose |
| ------ | ------ |
| /estimate | in the issue description, document the initial work estimate in days, hours, or minutes |
| /spend | in the comments for the issue, indicate how much time you spend working at that time | 

Here's the link to [Quick Actions](https://docs.gitlab.com/ee/user/project/quick_actions.html).  


