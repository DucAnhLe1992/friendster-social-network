import { Types } from 'mongoose';

interface UserLike {
  _id: Types.ObjectId;
  email?: string;
  handle: string;
  displayName: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  location?: string;
  website?: string;
  isVerified?: boolean;
  followers?: Types.ObjectId[];
  following?: Types.ObjectId[];
  createdAt?: Date;
}

export const AUTHOR_FIELDS = 'handle displayName avatar isVerified';

export const publicUser = (user: UserLike, viewerId?: string) => ({
  _id: user._id.toString(),
  handle: user.handle,
  displayName: user.displayName,
  bio: user.bio ?? '',
  avatar: user.avatar ?? '',
  coverImage: user.coverImage ?? '',
  location: user.location ?? '',
  website: user.website ?? '',
  isVerified: user.isVerified ?? false,
  followerCount: user.followers?.length ?? 0,
  followingCount: user.following?.length ?? 0,
  isFollowing: viewerId ? (user.followers ?? []).some((id) => id.toString() === viewerId) : false,
  createdAt: user.createdAt,
});

export const selfUser = (user: UserLike) => ({
  ...publicUser(user),
  email: user.email ?? '',
});

interface PostLike {
  _id: Types.ObjectId;
  author: unknown;
  content: string;
  images: string[];
  likes: Types.ObjectId[];
  commentsCount: number;
  sharesCount: number;
  isEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const publicAuthor = (author: unknown) => {
  if (!author || typeof author !== 'object' || !('handle' in author)) return author;
  const a = author as UserLike;
  return { _id: a._id, handle: a.handle, displayName: a.displayName, avatar: a.avatar ?? '', isVerified: a.isVerified ?? false };
};

/** The only shape a post leaves the API in; internal fields such as publication status never reach clients. */
export const publicPost = (post: PostLike, viewerId?: string) => ({
  _id: post._id,
  author: publicAuthor(post.author),
  content: post.content,
  images: post.images,
  likeCount: post.likes.length,
  isLiked: viewerId ? post.likes.some((id) => id.toString() === viewerId) : false,
  commentsCount: post.commentsCount,
  sharesCount: post.sharesCount,
  isEdited: post.isEdited,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
});

export const withLikeStatus = <T extends { likes: Types.ObjectId[] }>(item: T, viewerId?: string) => {
  const { likes, ...rest } = item;
  return {
    ...rest,
    likeCount: likes.length,
    isLiked: viewerId ? likes.some((id) => id.toString() === viewerId) : false,
  };
};
