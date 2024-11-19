// @ts-ignore
import { Text, TextIterator } from "@codemirror/text";
import execWithIndices from 'regexp-match-indices';

const empty = { from: -1, to: -1, match: /.*/.exec("")! };

const baseFlags = "gm" + (/x/.unicode == null ? "" : "u");

// 修改后的构造函数，使用正则表达式来匹配中文字符
export class RegExpCursor implements Iterator<{ from: number, to: number, match: RegExpExecArray }> {
	private iter!: TextIterator;
	private re!: RegExp;
	private curLine = "";
	private curLineStart!: number;
	private matchPos!: number;

	// 是否已经到达搜索范围的末尾
	done = false;

	// 成功匹配时，包含匹配位置和结果
	value = empty;

	// 创建一个游标来搜索给定范围内的内容，query 是正则表达式
	constructor(text: Text, query: string, options?: { ignoreCase?: boolean }, from: number = 0, private to: number = text.length) {
		// 处理中文字符的正则表达式
		this.re = new RegExp(query, baseFlags + (options?.ignoreCase ? "i" : ""));
		this.iter = text.iter();
		let startLine = text.lineAt(from);
		this.curLineStart = startLine.from;
		this.matchPos = from;
		this.getLine(this.curLineStart);
	}

	// 获取当前行的内容
	private getLine(skip: number) {
		this.iter.next(skip);
		if (this.iter.lineBreak) {
			this.curLine = "";
		} else {
			this.curLine = this.iter.value;
			if (this.curLineStart + this.curLine.length > this.to)
				this.curLine = this.curLine.slice(0, this.to - this.curLineStart);
			this.iter.next();
		}
	}

	// 处理下一行
	private nextLine() {
		this.curLineStart = this.curLineStart + this.curLine.length + 1;
		if (this.curLineStart > this.to) this.curLine = "";
		else this.getLine(0);
	}

	// 移动到下一个匹配项
	next() {
		for (let off = this.matchPos - this.curLineStart; ;) {
			this.re.lastIndex = off;
			let match = this.matchPos <= this.to && execWithIndices(this.re, this.curLine);
			if (match) {
				let from = this.curLineStart + match.index, to = from + match[0].length;
				this.matchPos = to + (from == to ? 1 : 0);
				if (from == this.curLine.length) this.nextLine();
				if (from < to || from > this.value.to) {
					this.value = { from, to, match };
					return this;
				}
				off = this.matchPos - this.curLineStart;
			} else if (this.curLineStart + this.curLine.length < this.to) {
				this.nextLine();
				off = 0;
			} else {
				this.done = true;
				return this;
			}
		}
	}

	[Symbol.iterator]!: () => Iterator<{ from: number, to: number, match: RegExpExecArray }>;
}

const flattened = new WeakMap<Text, FlattenedDoc>();

// 用于缓存文档的部分文本
class FlattenedDoc {
	constructor(readonly from: number, readonly text: string) {}

	get to() {
		return this.from + this.text.length;
	}

	static get(doc: Text, from: number, to: number) {
		let cached = flattened.get(doc);
		if (!cached || cached.from >= to || cached.to <= from) {
			let flat = new FlattenedDoc(from, doc.sliceString(from, to));
			flattened.set(doc, flat);
			return flat;
		}
		if (cached.from == from && cached.to == to) return cached;
		let { text, from: cachedFrom } = cached;
		if (cachedFrom > from) {
			text = doc.sliceString(from, cachedFrom) + text;
			cachedFrom = from;
		}
		if (cached.to < to)
			text += doc.sliceString(cached.to, to);
		flattened.set(doc, new FlattenedDoc(cachedFrom, text));
		return new FlattenedDoc(from, text.slice(from - cachedFrom, to - cachedFrom));
	}
}

const enum Chunk { Base = 5000 }
