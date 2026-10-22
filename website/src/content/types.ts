export type IHastElement = {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
};

export type IHastContext<TNode> = {
  setProperty(node: TNode, key: string, value: unknown): void;
};
