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

export const withLikeStatus = <T extends { likes: Types.ObjectId[] }>(item: T, viewerId?: string) => {
  const { likes, ...rest } = item;
  return {
    ...rest,
    likeCount: likes.length,
    isLiked: viewerId ? likes.some((id) => id.toString() === viewerId) : false,
  };
};
