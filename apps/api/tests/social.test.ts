import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { db } from '../src/database/db';
import { commentsTable } from '../src/database/schema';
import { app, auth, registerUser } from './helpers';

describe('comments, follows and notifications', () => {
  it('prevents a comment parent from belonging to a different post at the database layer', async () => {
    const alice = await registerUser('alice');
    const firstPost = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'first post' }).expect(201);
    const secondPost = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'second post' }).expect(201);
    const root = await request(app)
      .post(`/api/posts/${firstPost.body.data.post._id}/comments`)
      .set(auth(alice))
      .send({ content: 'root' })
      .expect(201);

    await expect(
      db.insert(commentsTable).values({
        postId: secondPost.body.data.post._id,
        authorId: alice.id,
        content: 'cross-post reply',
        parentId: root.body.data.comment._id,
      })
    ).rejects.toThrow();
  });

  it('threads replies, counts them, and cleans up when a comment is deleted', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const post = await request(app).post('/api/posts').set(auth(alice)).send({ content: 'hello' }).expect(201);
    const postId = post.body.data.post._id;

    const top = await request(app).post(`/api/posts/${postId}/comments`).set(auth(bob)).send({ content: 'first' }).expect(201);
    const commentId = top.body.data.comment._id;
    const reply = await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set(auth(alice))
      .send({ content: 'thanks', parentComment: commentId })
      .expect(201);
    // A reply to a reply joins the top-level thread.
    await request(app)
      .post(`/api/posts/${postId}/comments`)
      .set(auth(bob))
      .send({ content: 'welcome', parentComment: reply.body.data.comment._id })
      .expect(201);

    await request(app).post(`/api/posts/${postId}/comments/${commentId}/like`).set(auth(alice)).expect(200);
    const list = await request(app).get(`/api/posts/${postId}/comments`).set(auth(alice)).expect(200);
    expect(list.body.data.comments).toHaveLength(1);
    expect(list.body.data.comments[0]).toMatchObject({ replyCount: 2, likeCount: 1, isLiked: true });
    expect(list.body.data.comments[0].author.handle).toBe('bob');

    const replies = await request(app).get(`/api/posts/${postId}/comments/${commentId}/replies`).expect(200);
    expect(replies.body.data.replies.map((r: { content: string }) => r.content)).toEqual(['thanks', 'welcome']);

    const detail = await request(app).get(`/api/posts/${postId}`).expect(200);
    expect(detail.body.data.post.commentsCount).toBe(3);

    const bobReplies = await request(app).get('/api/users/bob/replies').expect(200);
    expect(bobReplies.body.data.replies).toHaveLength(2);
    expect(bobReplies.body.data.replies[0].post.author).toEqual({ handle: 'alice', displayName: 'alice' });

    await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(alice)).expect(404);
    const removed = await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(bob)).expect(200);
    expect(removed.body.data.removed).toBe(3);
    const after = await request(app).get(`/api/posts/${postId}`).expect(200);
    expect(after.body.data.post.commentsCount).toBe(0);
  });

  it('follows, notifies, and unfollows', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');

    const followed = await request(app).post('/api/users/bob/follow').set(auth(alice)).expect(200);
    expect(followed.body.data).toEqual({ isFollowing: true, followerCount: 1 });
    await request(app).post('/api/users/bob/follow').set(auth(alice)).expect(200);

    const profile = await request(app).get('/api/users/bob').set(auth(alice)).expect(200);
    expect(profile.body.data.user).toMatchObject({ handle: 'bob', followerCount: 1, isFollowing: true, postCount: 0 });
    expect(profile.body.data.user.email).toBeUndefined();

    const followers = await request(app).get('/api/users/bob/followers').expect(200);
    expect(followers.body.data.users.map((u: { handle: string }) => u.handle)).toEqual(['alice']);
    const following = await request(app).get('/api/users/alice/following').expect(200);
    expect(following.body.data.users.map((u: { handle: string }) => u.handle)).toEqual(['bob']);

    const inbox = await request(app).get('/api/notifications').set(auth(bob)).expect(200);
    expect(inbox.body.data.notifications).toHaveLength(1);
    expect(inbox.body.data.notifications[0]).toMatchObject({ type: 'follow', isRead: false, post: null, comment: null });
    expect(inbox.body.data.notifications[0].sender.handle).toBe('alice');
    expect(inbox.body.meta.unreadCount).toBe(1);

    const notificationId = inbox.body.data.notifications[0]._id;
    await request(app).put(`/api/notifications/${notificationId}/read`).set(auth(alice)).expect(404);
    await request(app).put(`/api/notifications/${notificationId}/read`).set(auth(bob)).expect(200);
    const unread = await request(app).get('/api/notifications/unread-count').set(auth(bob)).expect(200);
    expect(unread.body.data.unreadCount).toBe(0);

    const unfollowed = await request(app).delete('/api/users/bob/follow').set(auth(alice)).expect(200);
    expect(unfollowed.body.data).toEqual({ isFollowing: false, followerCount: 0 });
    const emptied = await request(app).get('/api/notifications').set(auth(bob)).expect(200);
    expect(emptied.body.data.notifications).toHaveLength(0);
  });

  it('notifies on likes and shows the feed, suggestions and search', async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    await registerUser('carol');
    const post = await request(app).post('/api/posts').set(auth(bob)).send({ content: 'bob says hi' }).expect(201);

    await request(app).post(`/api/posts/${post.body.data.post._id}/like`).set(auth(alice)).expect(200);
    const inbox = await request(app).get('/api/notifications').set(auth(bob)).expect(200);
    expect(inbox.body.data.notifications[0]).toMatchObject({ type: 'like', post: { content: 'bob says hi' } });

    const before = await request(app).get('/api/posts/feed').set(auth(alice)).expect(200);
    expect(before.body.data.posts).toHaveLength(0);
    await request(app).post('/api/users/bob/follow').set(auth(alice)).expect(200);
    const feed = await request(app).get('/api/posts/feed').set(auth(alice)).expect(200);
    expect(feed.body.data.posts.map((p: { content: string }) => p.content)).toEqual(['bob says hi']);

    const suggestions = await request(app).get('/api/users/suggestions').set(auth(alice)).expect(200);
    expect(suggestions.body.data.users.map((u: { handle: string }) => u.handle)).toEqual(['carol']);

    const search = await request(app).get('/api/users/search').query({ q: 'CAR' }).expect(200);
    expect(search.body.data.users.map((u: { handle: string }) => u.handle)).toEqual(['carol']);
    const wildcard = await request(app).get('/api/users/search').query({ q: '%' }).expect(200);
    expect(wildcard.body.data.users).toHaveLength(0);
  });
});
