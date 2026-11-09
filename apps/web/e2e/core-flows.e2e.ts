import { expect, test, type Page } from '@playwright/test';

const unique = Date.now().toString(36);
const user = {
  displayName: 'E2E Tester',
  handle: `e2e_${unique}`,
  email: `e2e_${unique}@example.com`,
  password: 'correct-horse-battery',
};

async function signUp(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Full Name').fill(user.displayName);
  await page.getByLabel('Username').fill(user.handle);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');
}

test.describe.configure({ mode: 'serial' });

test('a new member can sign up, post, like and reply', async ({ page }) => {
  await signUp(page);
  await expect(page).toHaveTitle(/Home · Friendster/);

  const body = `Hello from the end-to-end suite ${unique}`;
  await page.getByPlaceholder("What's happening?").fill(body);
  await page.getByRole('button', { name: 'Post', exact: true }).click();

  const post = page.getByRole('article').filter({ hasText: body });
  await expect(post).toBeVisible();

  await post.getByRole('button', { name: 'Like' }).click();
  await expect(post.getByRole('button', { name: 'Unlike' })).toBeVisible();

  await post.getByText(body).click();
  await expect(page).toHaveURL(/\/post\//);
  await expect(page).toHaveTitle(/Post by E2E Tester/);

  const reply = `First reply ${unique}`;
  await page.getByPlaceholder('Post your reply').fill(reply);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByText(reply)).toBeVisible();
});

test('a returning member can sign in and see their profile', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto(`/profile/${user.handle}`);
  await expect(page).toHaveTitle(new RegExp(`@${user.handle}`));
  await expect(page.getByRole('article').first()).toContainText('Hello from the end-to-end suite');
});

test('unknown pages show a friendly not-found screen', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page).toHaveTitle(/Page not found/);
});
