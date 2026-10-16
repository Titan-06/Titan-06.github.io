source "https://rubygems.org"

# Ruby 3.2+ & Ruby 4.0+ compatibility shim for Liquid 4.x used by github-pages gem
unless Object.method_defined?(:tainted?)
  class Object
    def tainted?
      false
    end

    def taint
      self
    end

    def untaint
      self
    end
  end
end

gem "github-pages", group: :jekyll_plugins
gem "webrick"
gem "csv"
gem "bigdecimal"
gem "base64"
gem "mutex_m"
