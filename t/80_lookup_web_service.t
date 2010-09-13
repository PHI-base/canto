use strict;
use warnings;
use Test::More tests => 2;

use PomCur::TestUtil;

use PomCur::Track;

my $test_util = PomCur::TestUtil->new();
$test_util->init_test();

my $config = $test_util->config();
my $lookup = PomCur::Track::get_lookup($config, 'go');


my $test_string = 'GO:00040';
my $include_children = 0;

package MockRequest;

sub param
{
  my $self = shift;
  my $arg = shift;

  if ($arg eq 'term') {
    return $test_string;
  } else {
    if ($arg eq 'max_results') {
      return 5;
    } else {
      if ($arg eq 'def') {
        return 1;
      } else {
        if ($arg eq 'children') {
          return $include_children;
        } else {
          die "got $arg";
        }
      }
    }
  }
}


package MockCatalyst;

sub req
{
  return bless {}, 'MockRequest';
}


package main;

my $c = bless {}, 'MockCatalyst';

my $results = $lookup->web_service_lookup($c, 'component');

ok(defined $results);

ok(grep { $_->{id} eq 'GO:0004022' &&
          $_->{name} eq 'alcohol dehydrogenase (NAD) activity' &&
          defined $_->{definition} &&
          $_->{definition} =~ /Catalysis of the reaction:/i } @$results);

$include_children = 1;
my $child_results =
  $lookup->web_service_lookup($c, 'component', 'children', 'GO:0004022');
