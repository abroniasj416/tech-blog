import type { CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export const UNCATEGORIZED = '미분류';

export function sortPostsByDate(posts: BlogPost[]) {
	return [...posts].sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function getCategoryName(post: BlogPost) {
	return post.data.category?.trim() || UNCATEGORIZED;
}

export function slugifyCategory(category: string) {
	return category.trim().toLowerCase().replace(/\s+/g, '-') || UNCATEGORIZED;
}

export function getPostPath(post: BlogPost) {
	const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
	return `${basePath}/blog/${post.id}/`;
}

export function getCategoryPath(category: string) {
	const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
	return `${basePath}/category/${encodeURIComponent(slugifyCategory(category))}/`;
}

export function getCategoryCounts(posts: BlogPost[]) {
	const counts = new Map<string, number>();

	for (const post of posts) {
		const category = getCategoryName(post);
		counts.set(category, (counts.get(category) ?? 0) + 1);
	}

	return [...counts.entries()]
		.map(([name, count]) => ({
			name,
			count,
			slug: slugifyCategory(name),
			href: getCategoryPath(name),
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
}

export function formatPostDate(date: Date) {
	return date.toLocaleDateString('ko-KR', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
}
